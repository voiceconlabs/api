import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';
import { AuthProvider } from '../schemas';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: `${configService.get<string>('BETTER_AUTH_URL') || 'http://localhost:3700'}/api/auth/callback/google`,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const authResponse = await this.authService.validateOAuthUser(
      {
        id: profile.id,
        email: profile.emails[0].value,
        name: profile.displayName,
        profileImageUrl: profile.photos?.[0]?.value,
      },
      AuthProvider.GOOGLE,
    );
    done(null, authResponse);
  }
}
