import { Types } from 'mongoose';

export interface IJwtPayload {
  sub: string;
  email: string;
}

export interface ITokens {
  accessToken: string;
  refreshToken: string;
}

export interface IAuthResponse extends ITokens {
  user: IUserResponse;
}

export interface IUserResponse {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  profileImageUrl?: string;
  provider: string;
}

export interface IOAuthProfile {
  id: string;
  email: string;
  name: string;
  profileImageUrl?: string;
}

export interface IValidatedUser {
  _id: Types.ObjectId;
  email: string;
  name: string;
  emailVerified: boolean;
  profileImageUrl?: string;
  provider: string;
}
