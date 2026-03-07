import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards';
import { IUserResponse } from '../auth/interfaces';
import { CreateCallDto, VoiceWebhookDto } from './dto';
import { ICallResponse, IPaginatedResponse, IPaginationQuery } from './interfaces';
import { CallsService } from './calls.service';
import { CallTemplate, CallTemplateDocument } from './schemas';

@Controller('calls')
export class CallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly configService: ConfigService,
    @InjectModel(CallTemplate.name) private templateModel: Model<CallTemplateDocument>,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: IUserResponse,
    @Body() dto: CreateCallDto,
  ): Promise<ICallResponse> {
    return this.callsService.create(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @CurrentUser() user: IUserResponse,
    @Query() query: IPaginationQuery,
  ): Promise<IPaginatedResponse<ICallResponse>> {
    return this.callsService.findAll(user.id, query);
  }

  @Get('templates')
  @UseGuards(JwtAuthGuard)
  async getTemplates() {
    const templates = await this.templateModel.find({ isActive: true }).exec();
    return {
      data: templates.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        description: t.description,
        category: t.category,
        systemPrompt: t.systemPrompt,
        requiredVariables: t.requiredVariables || [],
        isPublic: t.isPublic,
      })),
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @CurrentUser() user: IUserResponse,
    @Param('id') id: string,
  ): Promise<ICallResponse> {
    return this.callsService.findOne(user.id, id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @CurrentUser() user: IUserResponse,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    return this.callsService.remove(user.id, id);
  }

  @Post('webhook/voice-callback')
  async voiceWebhook(
    @Body() dto: VoiceWebhookDto,
    @Headers('x-webhook-secret') webhookSecret: string,
  ): Promise<{ message: string }> {
    const expectedSecret = this.configService.get<string>('VOICE_WEBHOOK_SECRET');
    if (expectedSecret && webhookSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
    return this.callsService.handleWebhook(dto);
  }
}
