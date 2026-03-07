import { IsString, IsOptional, IsObject, IsNumber, IsEnum } from 'class-validator';
import { CallStatus } from '../schemas';

export class VoiceWebhookDto {
  @IsString()
  callId: string;

  @IsEnum(CallStatus)
  status: CallStatus;

  @IsOptional()
  @IsString()
  externalCallId?: string;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsString()
  recordingUrl?: string;

  @IsOptional()
  @IsString()
  transcriptText?: string;

  @IsOptional()
  @IsObject()
  callData?: Record<string, any>;

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
