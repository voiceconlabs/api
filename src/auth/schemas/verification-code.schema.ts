import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VerificationCodeDocument = VerificationCode & Document;

export enum VerificationCodeType {
  EMAIL_VERIFICATION = 'email-verification',
  PASSWORD_RESET = 'password-reset',
}

@Schema({ timestamps: true })
export class VerificationCode {
  @Prop({ required: true, index: true })
  email: string;

  @Prop({ required: true })
  code: string;

  @Prop({ type: String, enum: VerificationCodeType, required: true })
  type: VerificationCodeType;

  @Prop({ required: true, index: true })
  expiresAt: Date;

  @Prop({ default: false })
  used: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const VerificationCodeSchema =
  SchemaFactory.createForClass(VerificationCode);

VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
