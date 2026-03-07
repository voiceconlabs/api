import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth';
import { QueueModule } from '../queue';
import { MeetingsController } from './meetings.controller';
import { MeetingsScheduler } from './meetings.scheduler';
import { MeetingsService } from './meetings.service';
import {
  ActionItem,
  ActionItemSchema,
  Meeting,
  MeetingSchema,
  Summary,
  SummarySchema,
  Transcript,
  TranscriptSchema,
} from './schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Meeting.name, schema: MeetingSchema },
      { name: Transcript.name, schema: TranscriptSchema },
      { name: Summary.name, schema: SummarySchema },
      { name: ActionItem.name, schema: ActionItemSchema },
    ]),
    ConfigModule,
    AuthModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingsScheduler],
  exports: [MeetingsService],
})
export class MeetingsModule {}
