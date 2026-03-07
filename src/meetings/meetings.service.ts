import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { CreateMeetingDto, UpdateMeetingDto, BotWebhookDto, BotEventType } from './dto';
import {
  IActionItemResponse,
  IMeetingResponse,
  IPaginatedResponse,
  IPaginationQuery,
  ISummaryResponse,
  ITranscriptResponse,
} from './interfaces';
import {
  ActionItem,
  ActionItemDocument,
  Meeting,
  MeetingDocument,
  MeetingPlatform,
  MeetingStatus,
  Summary,
  SummaryDocument,
  Transcript,
  TranscriptDocument,
} from './schemas';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);
  private activeBots: Map<string, string> = new Map();

  constructor(
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @InjectModel(Transcript.name) private transcriptModel: Model<TranscriptDocument>,
    @InjectModel(Summary.name) private summaryModel: Model<SummaryDocument>,
    @InjectModel(ActionItem.name) private actionItemModel: Model<ActionItemDocument>,
    @Inject(forwardRef(() => QueueService)) private queueService: QueueService,
  ) {}

  async create(userId: string, dto: CreateMeetingDto): Promise<IMeetingResponse> {
    const platform = this.detectPlatform(dto.meetingUrl);
    const title = this.generateTitle(platform);

    const meeting = await this.meetingModel.create({
      userId: new Types.ObjectId(userId),
      title,
      meetingUrl: dto.meetingUrl,
      platform,
      status: MeetingStatus.SCHEDULED,
    });

    return this.formatMeetingResponse(meeting);
  }

  private generateTitle(platform: MeetingPlatform): string {
    const date = new Date();
    const formattedDate = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const platformNames: Record<MeetingPlatform, string> = {
      [MeetingPlatform.GOOGLE_MEET]: 'Google Meet',
      [MeetingPlatform.ZOOM]: 'Zoom',
      [MeetingPlatform.TEAMS]: 'Teams',
      [MeetingPlatform.WEBEX]: 'Webex',
      [MeetingPlatform.OTHER]: 'Meeting',
    };

    return `${platformNames[platform]} - ${formattedDate}`;
  }

  async findAll(
    userId: string,
    query: IPaginationQuery,
  ): Promise<IPaginatedResponse<IMeetingResponse>> {
    const { page = 1, limit = 10, status, platform, search } = query;
    const skip = (page - 1) * limit;

    const filter: any = { userId: new Types.ObjectId(userId) };

    if (status) {
      filter.status = status;
    }

    if (platform) {
      filter.platform = platform;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const [meetings, total] = await Promise.all([
      this.meetingModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.meetingModel.countDocuments(filter),
    ]);

    return {
      data: meetings.map((m) => this.formatMeetingResponse(m)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(userId: string, meetingId: string): Promise<IMeetingResponse> {
    const meeting = await this.meetingModel.findById(meetingId);

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    if (meeting.userId.toString() !== userId) {
      const isShared = meeting.sharedWith.some(
        (id) => id.toString() === userId,
      );
      if (!isShared) {
        throw new ForbiddenException('You do not have access to this meeting');
      }
    }

    return this.formatMeetingResponse(meeting);
  }

  async update(
    userId: string,
    meetingId: string,
    dto: UpdateMeetingDto,
  ): Promise<IMeetingResponse> {
    const meeting = await this.meetingModel.findById(meetingId);

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    if (meeting.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have permission to update this meeting');
    }

    const updateData: any = { ...dto };

    if (dto.startedAt) {
      updateData.startedAt = new Date(dto.startedAt);
    }
    if (dto.endedAt) {
      updateData.endedAt = new Date(dto.endedAt);
    }

    const updated = await this.meetingModel.findByIdAndUpdate(
      meetingId,
      updateData,
      { new: true },
    );

    return this.formatMeetingResponse(updated!);
  }

  async remove(userId: string, meetingId: string): Promise<{ message: string }> {
    const meeting = await this.meetingModel.findById(meetingId);

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    if (meeting.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have permission to delete this meeting');
    }

    await Promise.all([
      this.meetingModel.deleteOne({ _id: meetingId }),
      this.transcriptModel.deleteOne({ meetingId: new Types.ObjectId(meetingId) }),
      this.summaryModel.deleteOne({ meetingId: new Types.ObjectId(meetingId) }),
      this.actionItemModel.deleteMany({ meetingId: new Types.ObjectId(meetingId) }),
    ]);

    return { message: 'Meeting deleted successfully' };
  }

  async getTranscript(userId: string, meetingId: string): Promise<ITranscriptResponse | null> {
    await this.findOne(userId, meetingId);

    const transcript = await this.transcriptModel.findOne({
      meetingId: new Types.ObjectId(meetingId),
    });

    if (!transcript) {
      return null;
    }

    return this.formatTranscriptResponse(transcript);
  }

  async getSummary(userId: string, meetingId: string): Promise<ISummaryResponse | null> {
    await this.findOne(userId, meetingId);

    const summary = await this.summaryModel.findOne({
      meetingId: new Types.ObjectId(meetingId),
    });

    if (!summary) {
      return null;
    }

    return this.formatSummaryResponse(summary);
  }

  async getActionItems(userId: string, meetingId: string): Promise<IActionItemResponse[]> {
    await this.findOne(userId, meetingId);

    const actionItems = await this.actionItemModel.find({
      meetingId: new Types.ObjectId(meetingId),
    }).sort({ createdAt: -1 });

    return actionItems.map((item) => this.formatActionItemResponse(item));
  }

  private detectPlatform(url: string): MeetingPlatform {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('meet.google.com')) {
      return MeetingPlatform.GOOGLE_MEET;
    }
    if (lowerUrl.includes('zoom.us') || lowerUrl.includes('zoom.com')) {
      return MeetingPlatform.ZOOM;
    }
    if (lowerUrl.includes('teams.microsoft.com') || lowerUrl.includes('teams.live.com')) {
      return MeetingPlatform.TEAMS;
    }
    if (lowerUrl.includes('webex.com')) {
      return MeetingPlatform.WEBEX;
    }

    return MeetingPlatform.OTHER;
  }

  private formatMeetingResponse(meeting: MeetingDocument): IMeetingResponse {
    return {
      id: (meeting._id as Types.ObjectId).toString(),
      userId: meeting.userId.toString(),
      teamId: meeting.teamId?.toString(),
      title: meeting.title,
      description: meeting.description,
      meetingUrl: meeting.meetingUrl,
      platform: meeting.platform,
      status: meeting.status,
      scheduledAt: meeting.scheduledAt?.toISOString(),
      startedAt: meeting.startedAt?.toISOString(),
      endedAt: meeting.endedAt?.toISOString(),
      duration: meeting.duration,
      participants: meeting.participants.map((p) => ({
        name: p.name,
        email: p.email,
        speakerId: p.speakerId,
        role: p.role,
      })),
      recordingUrl: meeting.recordingUrl,
      audioUrl: meeting.audioUrl,
      thumbnailUrl: meeting.thumbnailUrl,
      tags: meeting.tags,
      createdAt: meeting.createdAt.toISOString(),
      updatedAt: meeting.updatedAt.toISOString(),
    };
  }

  private formatTranscriptResponse(transcript: TranscriptDocument): ITranscriptResponse {
    return {
      id: (transcript._id as Types.ObjectId).toString(),
      meetingId: transcript.meetingId.toString(),
      language: transcript.language,
      segments: transcript.segments.map((s) => ({
        speaker: s.speaker,
        speakerId: s.speakerId,
        text: s.text,
        startTime: s.startTime,
        endTime: s.endTime,
        confidence: s.confidence,
      })),
      fullText: transcript.fullText,
      createdAt: transcript.createdAt.toISOString(),
    };
  }

  private formatSummaryResponse(summary: SummaryDocument): ISummaryResponse {
    return {
      id: (summary._id as Types.ObjectId).toString(),
      meetingId: summary.meetingId.toString(),
      template: summary.template,
      purpose: summary.purpose,
      overview: summary.overview,
      keyTakeaways: summary.keyTakeaways,
      decisions: summary.decisions,
      nextSteps: summary.nextSteps,
      topics: summary.topics.map((t) => ({
        title: t.title,
        summary: t.summary,
        startTime: t.startTime,
        endTime: t.endTime,
      })),
      sentiment: summary.sentiment,
      talkTimeStats: summary.talkTimeStats.map((s) => ({
        speaker: s.speaker,
        percentage: s.percentage,
        totalSeconds: s.totalSeconds,
      })),
      createdAt: summary.createdAt.toISOString(),
    };
  }

  private formatActionItemResponse(item: ActionItemDocument): IActionItemResponse {
    return {
      id: (item._id as Types.ObjectId).toString(),
      meetingId: item.meetingId.toString(),
      title: item.title,
      description: item.description,
      assignee: item.assignee,
      dueDate: item.dueDate?.toISOString(),
      status: item.status,
      priority: item.priority,
      createdAt: item.createdAt.toISOString(),
    };
  }

  async startRecording(userId: string, meetingId: string): Promise<{ message: string; jobId: string }> {
    const meeting = await this.findOne(userId, meetingId);

    if (meeting.status !== MeetingStatus.SCHEDULED) {
      throw new BadRequestException('Meeting is not in scheduled state');
    }

    const job = await this.queueService.addBotRecordingJob({
      meetingId,
      meetingUrl: meeting.meetingUrl!,
      maxDuration: 3600000,
    });

    await this.meetingModel.updateOne(
      { _id: new Types.ObjectId(meetingId) },
      { status: MeetingStatus.RECORDING },
    );

    this.logger.log(`Started recording for meeting ${meetingId}, job ${job.id}`);

    return {
      message: 'Recording started - bot will join shortly',
      jobId: job.id || '',
    };
  }

  async stopRecording(userId: string, meetingId: string): Promise<{ message: string }> {
    const meeting = await this.findOne(userId, meetingId);

    if (meeting.status !== MeetingStatus.RECORDING) {
      throw new BadRequestException('Meeting is not currently recording');
    }

    this.activeBots.delete(meetingId);

    await this.meetingModel.updateOne(
      { _id: new Types.ObjectId(meetingId) },
      {
        status: MeetingStatus.PROCESSING,
        endedAt: new Date(),
      },
    );

    this.logger.log(`Stopped recording for meeting ${meetingId}`);

    return { message: 'Recording stopped' };
  }

  async handleBotCallback(dto: BotWebhookDto): Promise<{ message: string }> {
    const { meetingId, event, videoUrl, audioUrl, duration, error } = dto;

    this.logger.log(`Bot callback received: ${event} for meeting ${meetingId}`);

    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    switch (event) {
      case BotEventType.RECORDING_STARTED:
        await this.meetingModel.updateOne(
          { _id: new Types.ObjectId(meetingId) },
          { status: MeetingStatus.RECORDING, startedAt: new Date() },
        );
        break;

      case BotEventType.RECORDING_STOPPED:
      case BotEventType.UPLOAD_COMPLETE:
        const updateData: any = {
          endedAt: new Date(),
        };

        if (videoUrl) updateData.recordingUrl = videoUrl;
        if (audioUrl) updateData.audioUrl = audioUrl;
        if (duration) updateData.duration = duration;

        await this.meetingModel.updateOne(
          { _id: new Types.ObjectId(meetingId) },
          updateData,
        );

        if (audioUrl) {
          await this.queueService.addMeetingProcessJob({
            meetingId,
            audioUrl,
            videoUrl: videoUrl || '',
          });
        }
        break;

      case BotEventType.RECORDING_FAILED:
        await this.meetingModel.updateOne(
          { _id: new Types.ObjectId(meetingId) },
          { status: MeetingStatus.FAILED },
        );
        this.logger.error(`Recording failed for meeting ${meetingId}: ${error}`);
        break;
    }

    return { message: 'Callback processed' };
  }

  async triggerProcessing(userId: string, meetingId: string): Promise<{ message: string; jobId: string }> {
    const meeting = await this.findOne(userId, meetingId);

    if (!meeting.audioUrl) {
      throw new BadRequestException('No audio file available for processing');
    }

    const job = await this.queueService.addMeetingProcessJob({
      meetingId,
      audioUrl: meeting.audioUrl,
      videoUrl: meeting.recordingUrl || '',
    });

    await this.meetingModel.updateOne(
      { _id: new Types.ObjectId(meetingId) },
      { status: MeetingStatus.PROCESSING },
    );

    this.logger.log(`Processing triggered for meeting ${meetingId}, job ${job.id}`);

    return {
      message: 'Processing started',
      jobId: job.id || '',
    };
  }

  async getScheduledMeetings(): Promise<IMeetingResponse[]> {
    const meetings = await this.meetingModel
      .find({ status: MeetingStatus.SCHEDULED })
      .sort({ createdAt: 1 })
      .limit(10)
      .exec();

    return meetings.map((m) => this.formatMeetingResponse(m));
  }

  async resetMeetingStatus(meetingId: string, status: string): Promise<IMeetingResponse> {
    const validStatuses = Object.values(MeetingStatus);
    if (!validStatuses.includes(status as MeetingStatus)) {
      throw new BadRequestException(`Invalid status. Valid values: ${validStatuses.join(', ')}`);
    }

    const meeting = await this.meetingModel.findByIdAndUpdate(
      meetingId,
      { status },
      { new: true },
    );

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    this.logger.log(`Meeting ${meetingId} status reset to ${status}`);
    return this.formatMeetingResponse(meeting);
  }
}
