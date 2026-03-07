import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QueueService, ICallJob } from './queue.service';
import { AiService } from '../ai/ai.service';
import { Call, CallDocument, CallStatus, CallTemplate, CallTemplateDocument } from '../calls/schemas';

@Injectable()
export class QueueProcessor implements OnModuleInit {
  private readonly logger = new Logger(QueueProcessor.name);
  private worker: Worker<ICallJob>;

  constructor(
    private queueService: QueueService,
    private aiService: AiService,
    @InjectModel(Call.name) private callModel: Model<CallDocument>,
    @InjectModel(CallTemplate.name) private templateModel: Model<CallTemplateDocument>,
  ) {}

  async onModuleInit() {
    this.worker = new Worker<ICallJob>(
      'voice-calls',
      async (job: Job<ICallJob>) => {
        return this.processCall(job);
      },
      {
        connection: this.queueService.getConnection(),
        prefix: this.queueService.getPrefix(),
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Job ${job.id} completed for call ${job.data.callId}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job ${job?.id} failed: ${error.message}`);
    });

    this.logger.log('Queue processor initialized');
  }

  private async processCall(job: Job<ICallJob>) {
    const { callId, phoneNumber, templateId, variables } = job.data;
    this.logger.log(`Processing call: ${callId} to ${phoneNumber}`);

    try {
      await this.updateCallStatus(callId, CallStatus.RINGING);

      await job.updateProgress(20);

      let systemPrompt = 'You are a helpful AI assistant making a phone call.';

      if (templateId) {
        const template = await this.templateModel.findById(templateId);
        if (template) {
          systemPrompt = template.systemPrompt;

          if (variables && template.requiredVariables) {
            for (const variable of template.requiredVariables) {
              const value = variables[variable];
              if (value) {
                systemPrompt = systemPrompt.replace(`{{${variable}}}`, value);
              }
            }
          }
        }
      }

      await job.updateProgress(40);

      const callResult = await this.aiService.makeVoiceCall({
        phoneNumber,
        systemPrompt,
        callId,
      });

      await job.updateProgress(60);

      if (callResult.success) {
        await this.callModel.updateOne(
          { _id: new Types.ObjectId(callId) },
          {
            status: CallStatus.IN_PROGRESS,
            externalCallId: callResult.externalCallId,
            startedAt: new Date(),
          },
        );
      } else {
        await this.updateCallStatus(callId, CallStatus.FAILED, callResult.error);
      }

      await job.updateProgress(100);

      this.logger.log(`Call ${callId} initiated successfully`);

      return { success: true, callId, externalCallId: callResult.externalCallId };
    } catch (error) {
      this.logger.error(`Failed to process call ${callId}: ${error.message}`);
      await this.updateCallStatus(callId, CallStatus.FAILED, error.message);
      throw error;
    }
  }

  private async updateCallStatus(callId: string, status: CallStatus, errorMessage?: string) {
    const updateData: any = { status };
    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    await this.callModel.updateOne(
      { _id: new Types.ObjectId(callId) },
      updateData,
    );
  }
}
