import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';

export enum BotEventType {
  RECORDING_STARTED = 'recording_started',
  RECORDING_STOPPED = 'recording_stopped',
  RECORDING_FAILED = 'recording_failed',
  UPLOAD_COMPLETE = 'upload_complete',
}

export class BotWebhookDto {
  @IsString()
  meetingId: string;

  @IsEnum(BotEventType)
  event: BotEventType;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  botId?: string;
}
