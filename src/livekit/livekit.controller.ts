import { Controller, Get, Post, Body, UseGuards, Param } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { LiveKitService } from './livekit.service';
import { AiAgentService } from './ai-agent.service';

class CreateWebCallDto {
  @IsString()
  callId: string;
}

class CreateWidgetCallDto {
  @IsOptional()
  @IsString()
  callId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  widgetKey?: string;
}

@Controller('livekit')
@UseGuards(JwtAuthGuard)
export class LiveKitController {
  constructor(
    private readonly livekitService: LiveKitService,
    private readonly aiAgentService: AiAgentService,
  ) {}

  @Get('rooms')
  async listRooms() {
    const rooms = await this.livekitService.listRooms();
    return {
      rooms: rooms.map(room => ({
        name: room.name,
        sid: room.sid,
        numParticipants: room.numParticipants,
        creationTime: room.creationTime,
      })),
    };
  }

  @Get('rooms/:name')
  async getRoom(@Param('name') name: string) {
    const room = await this.livekitService.getRoom(name);

    if (!room) {
      return { error: 'Room not found' };
    }

    return {
      room: {
        name: room.name,
        sid: room.sid,
        numParticipants: room.numParticipants,
        creationTime: room.creationTime,
      },
    };
  }

  @Post('webcall/create')
  async createWebCall(
    @CurrentUser() user: any,
    @Body() dto: CreateWebCallDto,
  ) {
    const session = await this.livekitService.createWebCallSession(
      dto.callId,
      user.id
    );

    return {
      success: true,
      roomName: session.roomName,
      token: session.token,
      url: session.url,
    };
  }

  @Public()
  @Post('widget/call')
  async createWidgetCall(@Body() dto: CreateWidgetCallDto) {
    const userId = dto.userId || `guest-${Date.now()}`;
    const callId = dto.callId || `widget-${Date.now()}`;

    const session = await this.livekitService.createWebCallSession(
      callId,
      userId
    );

    const agentToken = await this.livekitService.generateToken({
      roomName: session.roomName,
      participantIdentity: `ai-agent-${Date.now()}`,
      participantName: 'AI Assistant',
    });

    this.aiAgentService.spawnAgent({
      roomUrl: session.url,
      token: agentToken,
      roomName: session.roomName,
      systemPrompt: 'You are a helpful customer service agent. Be brief, friendly, and conversational.',
    });

    return {
      success: true,
      roomName: session.roomName,
      token: session.token,
      url: session.url,
    };
  }

  @Get('test')
  async testConnection() {
    try {
      const rooms = await this.livekitService.listRooms();
      return {
        success: true,
        message: 'LiveKit connection successful',
        url: this.livekitService.getLivekitUrl(),
        roomCount: rooms.length,
      };
    } catch (error) {
      return {
        success: false,
        message: 'LiveKit connection failed',
        error: error.message,
      };
    }
  }

  @Public()
  @Post('connection-details')
  async getConnectionDetails(@Body() dto: { roomName: string }) {
    const roomName = dto.roomName || `room-${Date.now()}`;
    const userId = `user-${Date.now()}`;

    const session = await this.livekitService.createWebCallSession(
      roomName,
      userId
    );

    return {
      serverUrl: session.url,
      participantToken: session.token,
      participantName: 'Guest User',
    };
  }
}
