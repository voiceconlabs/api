import { IsNotEmpty, IsString, IsOptional, IsObject, IsPhoneNumber } from 'class-validator';

export class CreateCallDto {
  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;
}
