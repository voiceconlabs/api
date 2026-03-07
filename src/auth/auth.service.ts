import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto';
import {
  IAuthResponse,
  IJwtPayload,
  IOAuthProfile,
  ITokens,
  IUserResponse,
  IValidatedUser,
} from './interfaces';
import {
  AuthProvider,
  RefreshToken,
  RefreshTokenDocument,
  User,
  UserDocument,
  VerificationCode,
  VerificationCodeDocument,
  VerificationCodeType,
} from './schemas';
import { EmailService } from './services/email.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(VerificationCode.name)
    private verificationCodeModel: Model<VerificationCodeDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existingUser = await this.userModel.findOne({ email: dto.email });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.userModel.create({
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
      provider: AuthProvider.LOCAL,
    });

    const otp = this.generateOtp();
    await this.verificationCodeModel.create({
      email: user.email,
      code: otp,
      type: VerificationCodeType.EMAIL_VERIFICATION,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await this.emailService.sendVerificationEmail(user.email, otp);

    return { message: 'Registration successful. Please verify your email.' };
  }

  async validateLocalUser(email: string, password: string): Promise<IValidatedUser> {
    const user = await this.userModel.findOne({ email });
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('Please verify your email first');
    }

    return {
      _id: user._id as Types.ObjectId,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      profileImageUrl: user.profileImageUrl,
      provider: user.provider,
    };
  }

  async login(user: IValidatedUser): Promise<IAuthResponse> {
    return this.generateAuthResponse(user);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<IAuthResponse> {
    const verificationCode = await this.verificationCodeModel.findOne({
      email: dto.email,
      code: dto.otp,
      type: VerificationCodeType.EMAIL_VERIFICATION,
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!verificationCode) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    const user = await this.userModel.findOneAndUpdate(
      { email: dto.email },
      { emailVerified: true },
      { new: true },
    );

    if (!user) {
      throw new BadRequestException('User not found');
    }

    await this.verificationCodeModel.updateOne(
      { _id: verificationCode._id },
      { used: true },
    );

    return this.generateAuthResponse({
      _id: user._id as Types.ObjectId,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      profileImageUrl: user.profileImageUrl,
      provider: user.provider,
    });
  }

  async resendVerification(dto: ResendVerificationDto): Promise<{ message: string }> {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user) {
      return { message: 'If this email exists, a verification code will be sent.' };
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    await this.verificationCodeModel.updateMany(
      { email: dto.email, type: VerificationCodeType.EMAIL_VERIFICATION },
      { used: true },
    );

    const otp = this.generateOtp();
    await this.verificationCodeModel.create({
      email: dto.email,
      code: otp,
      type: VerificationCodeType.EMAIL_VERIFICATION,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await this.emailService.sendVerificationEmail(dto.email, otp);

    return { message: 'Verification code sent.' };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user) {
      return { message: 'If this email exists, a reset code will be sent.' };
    }

    await this.verificationCodeModel.updateMany(
      { email: dto.email, type: VerificationCodeType.PASSWORD_RESET },
      { used: true },
    );

    const otp = this.generateOtp();
    await this.verificationCodeModel.create({
      email: dto.email,
      code: otp,
      type: VerificationCodeType.PASSWORD_RESET,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await this.emailService.sendPasswordResetEmail(dto.email, otp);

    return { message: 'Reset code sent.' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const verificationCode = await this.verificationCodeModel.findOne({
      email: dto.email,
      code: dto.otp,
      type: VerificationCodeType.PASSWORD_RESET,
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!verificationCode) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    await this.userModel.updateOne(
      { email: dto.email },
      { password: hashedPassword },
    );

    await this.verificationCodeModel.updateOne(
      { _id: verificationCode._id },
      { used: true },
    );

    await this.refreshTokenModel.updateMany(
      { userId: (await this.userModel.findOne({ email: dto.email }))?._id },
      { isRevoked: true },
    );

    return { message: 'Password reset successful.' };
  }

  async refreshToken(dto: RefreshTokenDto): Promise<ITokens> {
    const hashedToken = await bcrypt.hash(dto.refreshToken, 10);

    const storedTokens = await this.refreshTokenModel.find({
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    });

    let validToken: RefreshTokenDocument | null = null;
    for (const token of storedTokens) {
      const isMatch = await bcrypt.compare(dto.refreshToken, token.token);
      if (isMatch) {
        validToken = token;
        break;
      }
    }

    if (!validToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.userModel.findById(validToken.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.refreshTokenModel.updateOne(
      { _id: validToken._id },
      { isRevoked: true },
    );

    return this.generateTokens(user._id as Types.ObjectId, user.email);
  }

  async logout(userId: string, refreshToken?: string): Promise<{ message: string }> {
    if (refreshToken) {
      const storedTokens = await this.refreshTokenModel.find({
        userId: new Types.ObjectId(userId),
        isRevoked: false,
      });

      for (const token of storedTokens) {
        const isMatch = await bcrypt.compare(refreshToken, token.token);
        if (isMatch) {
          await this.refreshTokenModel.updateOne(
            { _id: token._id },
            { isRevoked: true },
          );
          break;
        }
      }
    } else {
      await this.refreshTokenModel.updateMany(
        { userId: new Types.ObjectId(userId) },
        { isRevoked: true },
      );
    }

    return { message: 'Logged out successfully.' };
  }

  async getProfile(userId: string): Promise<IUserResponse> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.formatUserResponse(user);
  }

  async validateOAuthUser(
    profile: IOAuthProfile,
    provider: AuthProvider,
  ): Promise<IAuthResponse> {
    let user = await this.userModel.findOne({
      $or: [
        { email: profile.email },
        { provider, providerId: profile.id },
      ],
    });

    if (!user) {
      user = await this.userModel.create({
        email: profile.email,
        name: profile.name,
        profileImageUrl: profile.profileImageUrl,
        provider,
        providerId: profile.id,
        emailVerified: true,
      });
    } else if (user.provider === AuthProvider.LOCAL && !user.providerId) {
      user = await this.userModel.findByIdAndUpdate(
        user._id,
        {
          providerId: profile.id,
          profileImageUrl: profile.profileImageUrl || user.profileImageUrl,
          emailVerified: true,
        },
        { new: true },
      );
    }

    return this.generateAuthResponse({
      _id: user!._id as Types.ObjectId,
      email: user!.email,
      name: user!.name,
      emailVerified: user!.emailVerified,
      profileImageUrl: user!.profileImageUrl,
      provider: user!.provider,
    });
  }

  private async generateTokens(userId: Types.ObjectId, email: string): Promise<ITokens> {
    const payload: IJwtPayload = { sub: userId.toString(), email };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    const refreshToken = this.generateRefreshToken();
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.refreshTokenModel.create({
      userId,
      token: hashedRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return { accessToken, refreshToken };
  }

  private async generateAuthResponse(user: IValidatedUser): Promise<IAuthResponse> {
    const tokens = await this.generateTokens(user._id, user.email);

    return {
      ...tokens,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        profileImageUrl: user.profileImageUrl,
        provider: user.provider,
      },
    };
  }

  private formatUserResponse(user: UserDocument): IUserResponse {
    return {
      id: (user._id as Types.ObjectId).toString(),
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      profileImageUrl: user.profileImageUrl,
      provider: user.provider,
    };
  }

  private generateOtp(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  private generateRefreshToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 64; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }
}
