import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum TemplateCategory {
  ECOMMERCE = 'ecommerce',
  HEALTHCARE = 'healthcare',
  RESTAURANT = 'restaurant',
  B2B_SALES = 'b2b_sales',
  CUSTOMER_SUPPORT = 'customer_support',
  CUSTOM = 'custom',
}

@Schema({ timestamps: true })
export class CallTemplate {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: TemplateCategory, required: true })
  category: TemplateCategory;

  @Prop({ required: true })
  systemPrompt: string;

  @Prop({ type: [String] })
  requiredVariables?: string[];

  @Prop({ default: false })
  isPublic: boolean;

  @Prop({ default: false })
  isActive: boolean;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export type CallTemplateDocument = CallTemplate & Document;
export const CallTemplateSchema = SchemaFactory.createForClass(CallTemplate);
