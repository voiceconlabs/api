import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { QueueService } from './queue.service';
import { QueueProcessor } from './queue.processor';
import { StorageModule } from '../storage/storage.module';
import { AiModule } from '../ai/ai.module';
import {
  Meeting,
  MeetingSchema,
  Transcript,
  TranscriptSchema,
  Summary,
  SummarySchema,
  ActionItem,
  ActionItemSchema,
} from '../meetings/schemas';

@Global()
@Module({
  imports: [
    ConfigModule,
    StorageModule,
    AiModule,
    MongooseModule.forFeature([
      { name: Meeting.name, schema: MeetingSchema },
      { name: Transcript.name, schema: TranscriptSchema },
      { name: Summary.name, schema: SummarySchema },
      { name: ActionItem.name, schema: ActionItemSchema },
    ]),
  ],
  providers: [QueueService, QueueProcessor],
  exports: [QueueService],
})
export class QueueModule {}
