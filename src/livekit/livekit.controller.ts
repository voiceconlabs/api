import { Controller, Get, Post, Body, UseGuards, Param } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { LiveKitService } from './livekit.service';

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
  constructor(private readonly livekitService: LiveKitService) {}

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
}
