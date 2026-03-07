import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MeetingDocument = Meeting & Document;

export enum MeetingPlatform {
  GOOGLE_MEET = 'google_meet',
  ZOOM = 'zoom',
  TEAMS = 'teams',
  WEBEX = 'webex',
  OTHER = 'other',
}

export enum MeetingStatus {
  SCHEDULED = 'scheduled',
  RECORDING = 'recording',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class MeetingParticipant {
  @Prop({ required: true })
  name: string;

  @Prop()
  email?: string;

  @Prop()
  speakerId?: string;

  @Prop({ type: String, enum: ['host', 'participant'], default: 'participant' })
  role: string;
}

export const MeetingParticipantSchema = SchemaFactory.createForClass(MeetingParticipant);

@Schema({ timestamps: true })
export class Meeting {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Team' })
  teamId?: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop()
  meetingUrl?: string;

  @Prop({ type: String, enum: MeetingPlatform, default: MeetingPlatform.OTHER })
  platform: MeetingPlatform;

  @Prop({ type: String, enum: MeetingStatus, default: MeetingStatus.SCHEDULED })
  status: MeetingStatus;

  @Prop()
  scheduledAt?: Date;

  @Prop()
  startedAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop({ default: 0 })
  duration: number;

  @Prop({ type: [MeetingParticipantSchema], default: [] })
  participants: MeetingParticipant[];

  @Prop()
  recordingUrl?: string;

  @Prop()
  audioUrl?: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  calendarEventId?: string;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  sharedWith: Types.ObjectId[];

  createdAt: Date;
  updatedAt: Date;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);

MeetingSchema.index({ userId: 1, createdAt: -1 });
MeetingSchema.index({ teamId: 1, createdAt: -1 });
MeetingSchema.index({ status: 1 });
