import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

export interface ICallJob {
  callId: string;
  phoneNumber: string;
  templateId?: string;
  variables?: Record<string, any>;
}

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection: IORedis;
  private readonly prefix: string;
  private callQueue: Queue<ICallJob>;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.prefix = this.configService.get<string>('REDIS_PREFIX') || 'voiceconf:';

    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }

  async onModuleInit() {
    this.callQueue = new Queue('voice-calls', {
      connection: this.connection,
      prefix: this.prefix,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    this.logger.log('Queue service initialized with prefix: ' + this.prefix);
  }

  async addCallJob(data: ICallJob): Promise<Job<ICallJob>> {
    this.logger.log(`Adding call job for: ${data.callId} to ${data.phoneNumber}`);
    return this.callQueue.add('make-call', data, {
      priority: 1,
    });
  }

  getCallQueue(): Queue<ICallJob> {
    return this.callQueue;
  }

  getConnection(): IORedis {
    return this.connection;
  }

  getPrefix(): string {
    return this.prefix;
  }
}
