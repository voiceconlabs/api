import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  meetingUrl: string;
}
