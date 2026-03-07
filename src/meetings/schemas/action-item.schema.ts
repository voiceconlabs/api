import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ActionItemDocument = ActionItem & Document;

export enum ActionItemStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum ActionItemPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Schema({ timestamps: true })
export class ActionItem {
  @Prop({ type: Types.ObjectId, ref: 'Meeting', required: true, index: true })
  meetingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop()
  assignee?: string;

  @Prop()
  dueDate?: Date;

  @Prop({ type: String, enum: ActionItemStatus, default: ActionItemStatus.PENDING })
  status: ActionItemStatus;

  @Prop({ type: String, enum: ActionItemPriority, default: ActionItemPriority.MEDIUM })
  priority: ActionItemPriority;

  createdAt: Date;
  updatedAt: Date;
}

export const ActionItemSchema = SchemaFactory.createForClass(ActionItem);

ActionItemSchema.index({ meetingId: 1, status: 1 });
ActionItemSchema.index({ userId: 1, status: 1 });
