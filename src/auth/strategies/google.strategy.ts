import { Strategy, VerifyCallback } from 'passport-google-oauth20';

import { AuthProvider } from '../schemas';
import { AuthService } from '../auth.service';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: `http://localhost:3800/api/auth/callback/google`,
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
