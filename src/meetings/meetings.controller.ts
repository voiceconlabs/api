import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards';
import { IUserResponse } from '../auth/interfaces';
import { CreateMeetingDto, UpdateMeetingDto } from './dto';
import {
  IActionItemResponse,
  IMeetingResponse,
  IPaginatedResponse,
  IPaginationQuery,
  ISummaryResponse,
  ITranscriptResponse,
} from './interfaces';
import { MeetingsService } from './meetings.service';
import { BotWebhookDto } from './dto/bot-webhook.dto';

@Controller('meetings')
export class MeetingsController {
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: IUserResponse,
    @Body() dto: CreateMeetingDto,
  ): Promise<IMeetingResponse> {
    return this.meetingsService.create(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @CurrentUser() user: IUserResponse,
    @Query() query: IPaginationQuery,
  ): Promise<IPaginatedResponse<IMeetingResponse>> {
    return this.meetingsService.findAll(user.id, query);
  }

  @Get('bot/scheduled')
  async getScheduledMeetings(
    @Headers('x-bot-secret') botSecret: string,
  ): Promise<{ data: IMeetingResponse[] }> {
    const expectedSecret = this.configService.get<string>('BOT_WEBHOOK_SECRET');
    if (expectedSecret && botSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid bot secret');
    }
    const meetings = await this.meetingsService.getScheduledMeetings();
    return { data: meetings };
  }

  @Post('webhook/bot-callback')
  async botCallback(
    @Body() dto: BotWebhookDto,
    @Headers('x-bot-secret') botSecret: string,
  ): Promise<{ message: string }> {
    const expectedSecret = this.configService.get<string>('BOT_WEBHOOK_SECRET');
    if (expectedSecret && botSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid bot secret');
    }
    return this.meetingsService.handleBotCallback(dto);
  }

  @Get('test/reset-status/:id')
  async resetMeetingStatus(
    @Param('id') id: string,
    @Query('status') status: string,
  ): Promise<{ message: string; meeting: IMeetingResponse }> {
    const meeting = await this.meetingsService.resetMeetingStatus(id, status || 'scheduled');
    return { message: `Status reset to ${status || 'scheduled'}`, meeting };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @CurrentUser() user: IUserResponse,
    @Param('id') id: string,
  ): Promise<IMeetingResponse> {
    return this.meetingsService.findOne(user.id, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @CurrentUser() user: IUserResponse,
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
  ): Promise<IMeetingResponse> {
    return this.meetingsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @CurrentUser() user: IUserResponse,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    return this.meetingsService.remove(user.id, id);
  }

  @Get(':id/transcript')
  @UseGuards(JwtAuthGuard)
  async getTranscript(
    @CurrentUser() user: IUserResponse,
    @Param('id') id: string,
  ): Promise<ITranscriptResponse | null> {
    return this.meetingsService.getTranscript(user.id, id);
  }

  @Get(':id/summary')
  @UseGuards(JwtAuthGuard)
  async getSummary(
    @CurrentUser() user: IUserResponse,
    @Param('id') id: string,
  ): Promise<ISummaryResponse | null> {
    return this.meetingsService.getSummary(user.id, id);
  }

  @Get(':id/action-items')
  @UseGuards(JwtAuthGuard)
  async getActionItems(
    @CurrentUser() user: IUserResponse,
    @Param('id') id: string,
  ): Promise<IActionItemResponse[]> {
    return this.meetingsService.getActionItems(user.id, id);
  }

  @Post(':id/start-recording')
  @UseGuards(JwtAuthGuard)
  async startRecording(
    @CurrentUser() user: IUserResponse,
    @Param('id') id: string,
  ): Promise<{ message: string; jobId: string }> {
    return this.meetingsService.startRecording(user.id, id);
  }

  @Post(':id/stop-recording')
  @UseGuards(JwtAuthGuard)
  async stopRecording(
    @CurrentUser() user: IUserResponse,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    return this.meetingsService.stopRecording(user.id, id);
  }

  @Post(':id/process')
  @UseGuards(JwtAuthGuard)
  async processRecording(
    @CurrentUser() user: IUserResponse,
    @Param('id') id: string,
  ): Promise<{ message: string; jobId: string }> {
    return this.meetingsService.triggerProcessing(user.id, id);
  }
}
