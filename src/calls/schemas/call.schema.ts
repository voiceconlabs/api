import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum CallStatus {
  QUEUED = 'queued',
  RINGING = 'ringing',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  NO_ANSWER = 'no_answer',
  BUSY = 'busy',
  CANCELLED = 'cancelled',
}

export enum CallDirection {
  OUTBOUND = 'outbound',
  INBOUND = 'inbound',
}

@Schema({ timestamps: true })
export class Call {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  phoneNumber: string;

  @Prop({ type: String, enum: CallDirection, default: CallDirection.OUTBOUND })
  direction: CallDirection;

  @Prop({ type: String, enum: CallStatus, default: CallStatus.QUEUED })
  status: CallStatus;

  @Prop()
  templateId?: string;

  @Prop()
  templateName?: string;

  @Prop({ type: Object })
  variables?: Record<string, any>;

  @Prop()
  externalCallId?: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop()
  duration?: number;

  @Prop()
  recordingUrl?: string;

  @Prop()
  transcriptText?: string;

  @Prop({ type: Object })
  callData?: Record<string, any>;

  @Prop()
  cost?: number;

  @Prop()
  errorMessage?: string;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export type CallDocument = Call & Document;
export const CallSchema = SchemaFactory.createForClass(Call);
