import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QueueService, IMeetingProcessJob } from './queue.service';
import { StorageService } from '../storage/storage.service';
import { AiService } from '../ai/ai.service';
import {
  Meeting,
  MeetingDocument,
  MeetingStatus,
  Transcript,
  TranscriptDocument,
  Summary,
  SummaryDocument,
  ActionItem,
  ActionItemDocument,
} from '../meetings/schemas';

@Injectable()
export class QueueProcessor implements OnModuleInit {
  private readonly logger = new Logger(QueueProcessor.name);
  private worker: Worker<IMeetingProcessJob>;

  constructor(
    private queueService: QueueService,
    private storageService: StorageService,
    private aiService: AiService,
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @InjectModel(Transcript.name) private transcriptModel: Model<TranscriptDocument>,
    @InjectModel(Summary.name) private summaryModel: Model<SummaryDocument>,
    @InjectModel(ActionItem.name) private actionItemModel: Model<ActionItemDocument>,
  ) {}

  async onModuleInit() {
    this.worker = new Worker<IMeetingProcessJob>(
      'meeting-processing',
      async (job: Job<IMeetingProcessJob>) => {
        return this.processMeeting(job);
      },
      {
        connection: this.queueService.getConnection(),
        prefix: this.queueService.getPrefix(),
        concurrency: 2,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Job ${job.id} completed for meeting ${job.data.meetingId}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job ${job?.id} failed: ${error.message}`);
    });

    this.logger.log('Queue processor initialized');
  }

  private async processMeeting(job: Job<IMeetingProcessJob>) {
    const { meetingId, audioUrl } = job.data;
    this.logger.log(`Processing meeting: ${meetingId}`);

    try {
      await this.updateMeetingStatus(meetingId, MeetingStatus.PROCESSING);

      await job.updateProgress(10);

      const audioKey = this.extractKeyFromUrl(audioUrl);
      const audioBuffer = await this.storageService.getFileBuffer(audioKey);

      await job.updateProgress(30);

      const transcriptResult = await this.aiService.transcribeAudio(audioBuffer);

      await job.updateProgress(50);

      await this.transcriptModel.create({
        meetingId: new Types.ObjectId(meetingId),
        language: transcriptResult.language,
        segments: transcriptResult.segments,
        fullText: transcriptResult.fullText,
      });

      await job.updateProgress(60);

      const summaryResult = await this.aiService.generateSummary(transcriptResult.fullText);

      await job.updateProgress(80);

      await this.summaryModel.create({
        meetingId: new Types.ObjectId(meetingId),
        template: 'default',
        overview: summaryResult.overview,
        keyTakeaways: summaryResult.keyTakeaways,
        decisions: summaryResult.decisions,
        nextSteps: summaryResult.nextSteps,
        topics: summaryResult.topics,
        sentiment: summaryResult.sentiment,
        talkTimeStats: [],
      });

      if (summaryResult.actionItems && summaryResult.actionItems.length > 0) {
        const actionItems = summaryResult.actionItems.map((item) => ({
          meetingId: new Types.ObjectId(meetingId),
          title: item.title,
          assignee: item.assignee,
          priority: item.priority,
          status: 'pending',
        }));

        await this.actionItemModel.insertMany(actionItems);
      }

      await job.updateProgress(90);

      await this.updateMeetingStatus(meetingId, MeetingStatus.COMPLETED);

      await job.updateProgress(100);

      this.logger.log(`Meeting ${meetingId} processed successfully`);

      return { success: true, meetingId };
    } catch (error) {
      this.logger.error(`Failed to process meeting ${meetingId}: ${error.message}`);
      await this.updateMeetingStatus(meetingId, MeetingStatus.FAILED);
      throw error;
    }
  }

  private async updateMeetingStatus(meetingId: string, status: MeetingStatus) {
    await this.meetingModel.updateOne(
      { _id: new Types.ObjectId(meetingId) },
      { status },
    );
  }

  private extractKeyFromUrl(url: string): string {
    const urlObj = new URL(url);
    return urlObj.pathname.slice(1);
  }
}
