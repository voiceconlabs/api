import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateCallDto, VoiceWebhookDto } from './dto';
import {
  ICallResponse,
  IPaginatedResponse,
  IPaginationQuery,
} from './interfaces';
import {
  Call,
  CallDocument,
  CallStatus,
  CallTemplate,
  CallTemplateDocument,
} from './schemas';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    @InjectModel(Call.name) private callModel: Model<CallDocument>,
    @InjectModel(CallTemplate.name) private templateModel: Model<CallTemplateDocument>,
    @Inject(forwardRef(() => QueueService)) private queueService: QueueService,
  ) {}

  async create(userId: string, dto: CreateCallDto): Promise<ICallResponse> {
    let templateName: string | undefined;

    if (dto.templateId) {
      const template = await this.templateModel.findById(dto.templateId);
      if (template) {
        templateName = template.name;
      }
    }

    const call = await this.callModel.create({
      userId: new Types.ObjectId(userId),
      phoneNumber: dto.phoneNumber,
      templateId: dto.templateId,
      templateName,
      variables: dto.variables,
      status: CallStatus.QUEUED,
    });

    await this.queueService.addCallJob({
      callId: call._id.toString(),
      phoneNumber: dto.phoneNumber,
      templateId: dto.templateId,
      variables: dto.variables,
    });

    this.logger.log(`Call created: ${call._id} to ${dto.phoneNumber}`);

    return this.formatCallResponse(call);
  }

  async findAll(
    userId: string,
    query: IPaginationQuery,
  ): Promise<IPaginatedResponse<ICallResponse>> {
    const { page = 1, limit = 10, status, search } = query;
    const skip = (page - 1) * limit;

    const filter: any = { userId: new Types.ObjectId(userId) };

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { phoneNumber: { $regex: search, $options: 'i' } },
        { templateName: { $regex: search, $options: 'i' } },
      ];
    }

    const [calls, total] = await Promise.all([
      this.callModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.callModel.countDocuments(filter),
    ]);

    return {
      data: calls.map((c) => this.formatCallResponse(c)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(userId: string, callId: string): Promise<ICallResponse> {
    const call = await this.callModel.findById(callId);

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (call.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this call');
    }

    return this.formatCallResponse(call);
  }

  async remove(userId: string, callId: string): Promise<{ message: string }> {
    const call = await this.callModel.findById(callId);

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (call.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have permission to delete this call');
    }

    await this.callModel.deleteOne({ _id: callId });

    return { message: 'Call deleted successfully' };
  }

  async handleWebhook(dto: VoiceWebhookDto): Promise<{ message: string }> {
    this.logger.log(`Webhook received for call: ${dto.callId}, status: ${dto.status}`);

    const updateData: any = { status: dto.status };

    if (dto.externalCallId) updateData.externalCallId = dto.externalCallId;
    if (dto.duration) updateData.duration = dto.duration;
    if (dto.recordingUrl) updateData.recordingUrl = dto.recordingUrl;
    if (dto.transcriptText) updateData.transcriptText = dto.transcriptText;
    if (dto.callData) updateData.callData = dto.callData;
    if (dto.cost) updateData.cost = dto.cost;
    if (dto.errorMessage) updateData.errorMessage = dto.errorMessage;

    if (dto.status === CallStatus.IN_PROGRESS && !updateData.startedAt) {
      updateData.startedAt = new Date();
    }

    if ([CallStatus.COMPLETED, CallStatus.FAILED, CallStatus.NO_ANSWER, CallStatus.BUSY].includes(dto.status)) {
      updateData.endedAt = new Date();
    }

    await this.callModel.findByIdAndUpdate(dto.callId, updateData);

    return { message: 'Webhook processed successfully' };
  }

  private formatCallResponse(call: CallDocument): ICallResponse {
    return {
      id: (call._id as Types.ObjectId).toString(),
      userId: call.userId.toString(),
      phoneNumber: call.phoneNumber,
      direction: call.direction,
      status: call.status,
      templateId: call.templateId,
      templateName: call.templateName,
      variables: call.variables,
      externalCallId: call.externalCallId,
      startedAt: call.startedAt?.toISOString(),
      endedAt: call.endedAt?.toISOString(),
      duration: call.duration,
      recordingUrl: call.recordingUrl,
      transcriptText: call.transcriptText,
      callData: call.callData,
      cost: call.cost,
      errorMessage: call.errorMessage,
      createdAt: call.createdAt.toISOString(),
      updatedAt: call.updatedAt.toISOString(),
    };
  }
}
