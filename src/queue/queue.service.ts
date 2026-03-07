import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

export interface IMeetingProcessJob {
  meetingId: string;
  audioUrl: string;
  videoUrl: string;
}

export interface IBotRecordingJob {
  meetingId: string;
  meetingUrl: string;
  maxDuration?: number;
}

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection: IORedis;
  private readonly prefix: string;
  private meetingQueue: Queue<IMeetingProcessJob>;
  private botQueue: Queue<IBotRecordingJob>;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.prefix = this.configService.get<string>('REDIS_PREFIX') || 'voiceconf:';

    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }

  async onModuleInit() {
    this.meetingQueue = new Queue('meeting-processing', {
      connection: this.connection,
      prefix: this.prefix,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    this.botQueue = new Queue('bot-recordings', {
      connection: this.connection,
      prefix: this.prefix,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    });

    this.logger.log('Queue service initialized with prefix: ' + this.prefix);
  }

  async addMeetingProcessJob(data: IMeetingProcessJob): Promise<Job<IMeetingProcessJob>> {
    this.logger.log(`Adding meeting process job for: ${data.meetingId}`);
    return this.meetingQueue.add('process-meeting', data, {
      priority: 1,
    });
  }

  async addBotRecordingJob(data: IBotRecordingJob): Promise<Job<IBotRecordingJob>> {
    this.logger.log(`Adding bot recording job for: ${data.meetingId}`);
    return this.botQueue.add('record-meeting', data);
  }

  getQueue(): Queue<IMeetingProcessJob> {
    return this.meetingQueue;
  }

  getBotQueue(): Queue<IBotRecordingJob> {
    return this.botQueue;
  }

  getConnection(): IORedis {
    return this.connection;
  }

  getPrefix(): string {
    return this.prefix;
  }
}
