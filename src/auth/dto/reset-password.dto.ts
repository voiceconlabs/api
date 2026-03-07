import { IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(4, 4)
  otp: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
