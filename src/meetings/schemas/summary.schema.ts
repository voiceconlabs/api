import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SummaryDocument = Summary & Document;

export enum SummaryTemplate {
  DEFAULT = 'default',
  SALES = 'sales',
  STANDUP = 'standup',
  INTERVIEW = 'interview',
  ONE_ON_ONE = 'one_on_one',
  BRAINSTORM = 'brainstorm',
  CUSTOM = 'custom',
}

@Schema()
export class SummaryTopic {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  summary: string;

  @Prop()
  startTime?: number;

  @Prop()
  endTime?: number;
}

export const SummaryTopicSchema = SchemaFactory.createForClass(SummaryTopic);

@Schema()
export class TalkTimeStats {
  @Prop({ required: true })
  speaker: string;

  @Prop({ required: true })
  percentage: number;

  @Prop({ required: true })
  totalSeconds: number;
}

export const TalkTimeStatsSchema = SchemaFactory.createForClass(TalkTimeStats);

@Schema({ timestamps: true })
export class Summary {
  @Prop({ type: Types.ObjectId, ref: 'Meeting', required: true, unique: true, index: true })
  meetingId: Types.ObjectId;

  @Prop({ type: String, enum: SummaryTemplate, default: SummaryTemplate.DEFAULT })
  template: SummaryTemplate;

  @Prop()
  purpose?: string;

  @Prop()
  overview?: string;

  @Prop({ type: [String], default: [] })
  keyTakeaways: string[];

  @Prop({ type: [String], default: [] })
  decisions: string[];

  @Prop({ type: [String], default: [] })
  nextSteps: string[];

  @Prop({ type: [SummaryTopicSchema], default: [] })
  topics: SummaryTopic[];

  @Prop({ type: String, enum: ['positive', 'neutral', 'negative'] })
  sentiment?: string;

  @Prop()
  followUpEmail?: string;

  @Prop({ type: [TalkTimeStatsSchema], default: [] })
  talkTimeStats: TalkTimeStats[];

  createdAt: Date;
  updatedAt: Date;
}

export const SummarySchema = SchemaFactory.createForClass(Summary);
