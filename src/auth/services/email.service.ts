import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;
  private fromEmail: string;

  constructor(private configService: ConfigService) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
    this.fromEmail =
      this.configService.get<string>('EMAIL_FROM') ||
      'VoiceConf <onboarding@resend.dev>';
  }

  async sendVerificationEmail(email: string, otp: string): Promise<void> {
    await this.resend.emails.send({
      from: this.fromEmail,
      to: email,
      subject: 'Verify your VoiceConf email - Code: ' + otp,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #8b5cf6; margin: 0; font-size: 28px;">VoiceConf</h1>
          </div>
          <h2 style="color: #1f2937; margin-bottom: 16px;">Verify your email</h2>
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 24px;">
            Thanks for signing up! Use the code below to verify your email address.
          </p>
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: #f3f4f6; padding: 16px 32px; border-radius: 8px; margin-bottom: 16px;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1f2937;">${otp}</span>
            </div>
          </div>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            If you didn't create an account with VoiceConf, you can safely ignore this email. This code will expire in 10 minutes.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            VoiceConf - AI Meeting Notes, Automatically
          </p>
        </div>
      `,
    });
  }

  async sendPasswordResetEmail(email: string, otp: string): Promise<void> {
    await this.resend.emails.send({
      from: this.fromEmail,
      to: email,
      subject: 'Reset your VoiceConf password - Code: ' + otp,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #8b5cf6; margin: 0; font-size: 28px;">VoiceConf</h1>
          </div>
          <h2 style="color: #1f2937; margin-bottom: 16px;">Reset your password</h2>
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 24px;">
            We received a request to reset your password. Use the code below to set a new password.
          </p>
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: #f3f4f6; padding: 16px 32px; border-radius: 8px; margin-bottom: 16px;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1f2937;">${otp}</span>
            </div>
          </div>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            If you didn't request this, you can safely ignore this email. This code will expire in 10 minutes.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            VoiceConf - AI Meeting Notes, Automatically
          </p>
        </div>
      `,
    });
  }
}
