import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Meeting, MeetingDocument, MeetingStatus } from './schemas';

@Injectable()
export class MeetingsScheduler {
  private readonly logger = new Logger(MeetingsScheduler.name);

  constructor(
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkScheduledMeetings(): Promise<void> {
    const scheduledMeetings = await this.meetingModel.find({
      status: MeetingStatus.SCHEDULED,
    });

    if (scheduledMeetings.length === 0) {
      return;
    }

    this.logger.log(`Found ${scheduledMeetings.length} scheduled meetings`);

    for (const meeting of scheduledMeetings) {
      await this.tryJoinMeeting(meeting);
    }
  }

  private async tryJoinMeeting(meeting: MeetingDocument): Promise<void> {
    this.logger.log(`Attempting to join meeting: ${meeting.title}`);

    try {
      await this.meetingModel.findByIdAndUpdate(meeting._id, {
        status: MeetingStatus.RECORDING,
        startedAt: new Date(),
      });

      this.logger.log(`Successfully started recording for: ${meeting.title}`);
    } catch (error) {
      this.logger.error(`Failed to join meeting ${meeting.title}:`, error);

      await this.meetingModel.findByIdAndUpdate(meeting._id, {
        status: MeetingStatus.FAILED,
      });
    }
  }
}
