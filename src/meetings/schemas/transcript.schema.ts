import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TranscriptDocument = Transcript & Document;

@Schema()
export class TranscriptSegment {
  @Prop({ required: true })
  speaker: string;

  @Prop()
  speakerId?: string;

  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  startTime: number;

  @Prop({ required: true })
  endTime: number;

  @Prop()
  confidence?: number;
}

export const TranscriptSegmentSchema = SchemaFactory.createForClass(TranscriptSegment);

@Schema({ timestamps: true })
export class Transcript {
  @Prop({ type: Types.ObjectId, ref: 'Meeting', required: true, unique: true, index: true })
  meetingId: Types.ObjectId;

  @Prop({ default: 'en' })
  language: string;

  @Prop({ type: [TranscriptSegmentSchema], default: [] })
  segments: TranscriptSegment[];

  @Prop()
  fullText?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const TranscriptSchema = SchemaFactory.createForClass(Transcript);
