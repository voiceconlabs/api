import { AuthProvider } from '../schemas';
import { AuthService } from '../auth.service';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GITHUB_CLIENT_ID')!,
      clientSecret: configService.get<string>('GITHUB_CLIENT_SECRET')!,
      callbackURL: `${configService.get<string>('BETTER_AUTH_URL') || 'http://localhost:3800/'}/api/auth/callback/github`,
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (err: any, user: any) => void,
  ) {
    const email = profile.emails?.[0]?.value || `${profile.username}@github.local`;
    const authResponse = await this.authService.validateOAuthUser(
      {
        id: profile.id,
        email,
        name: profile.displayName || profile.username,
        profileImageUrl: profile.photos?.[0]?.value,
      },
      AuthProvider.GITHUB,
    );
    done(null, authResponse);
  }
}
