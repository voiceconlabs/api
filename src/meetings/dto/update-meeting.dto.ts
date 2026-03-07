import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { MeetingStatus } from '../schemas';

export class UpdateMeetingDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsUrl()
  @IsOptional()
  meetingUrl?: string;

  @IsEnum(MeetingStatus)
  @IsOptional()
  status?: MeetingStatus;

  @IsDateString()
  @IsOptional()
  startedAt?: string;

  @IsDateString()
  @IsOptional()
  endedAt?: string;

  @IsNumber()
  @IsOptional()
  duration?: number;

  @IsString()
  @IsOptional()
  recordingUrl?: string;

  @IsString()
  @IsOptional()
  audioUrl?: string;
}
