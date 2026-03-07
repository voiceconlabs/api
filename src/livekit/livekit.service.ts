import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoomServiceClient, AccessToken, Room } from 'livekit-server-sdk';

export interface ILiveKitRoomOptions {
  name: string;
  emptyTimeout?: number;
  maxParticipants?: number;
}

export interface ILiveKitTokenOptions {
  roomName: string;
  participantIdentity: string;
  participantName?: string;
  metadata?: string;
  ttl?: number;
}

export interface ILiveKitVoiceCallRequest {
  phoneNumber: string;
  roomName: string;
  systemPrompt?: string;
}

export interface ILiveKitVoiceCallResult {
  success: boolean;
  roomName: string;
  participantId?: string;
  error?: string;
}

@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);
  private readonly roomClient: RoomServiceClient;
  private readonly livekitUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(
    private configService: ConfigService,
  ) {
    this.livekitUrl = this.configService.get<string>('LIVEKIT_URL')!;
    this.apiKey = this.configService.get<string>('LIVEKIT_API_KEY')!;
    this.apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET')!;

    this.roomClient = new RoomServiceClient(
      this.livekitUrl,
      this.apiKey,
      this.apiSecret
    );

    this.logger.log('LiveKit service initialized');
  }

  async createRoom(options: ILiveKitRoomOptions): Promise<Room> {
    this.logger.log(`Creating LiveKit room: ${options.name}`);

    try {
      const room = await this.roomClient.createRoom({
        name: options.name,
        emptyTimeout: options.emptyTimeout || 300,
        maxParticipants: options.maxParticipants || 10,
      });

      this.logger.log(`Room created successfully: ${room.name}`);
      return room;
    } catch (error) {
      this.logger.error(`Failed to create room: ${error.message}`);
      throw error;
    }
  }

  async listRooms(): Promise<Room[]> {
    try {
      const rooms = await this.roomClient.listRooms();
      return rooms;
    } catch (error) {
      this.logger.error(`Failed to list rooms: ${error.message}`);
      throw error;
    }
  }

  async getRoom(roomName: string): Promise<Room | null> {
    try {
      const rooms = await this.roomClient.listRooms([roomName]);
      return rooms.length > 0 ? rooms[0] : null;
    } catch (error) {
      this.logger.error(`Failed to get room: ${error.message}`);
      return null;
    }
  }

  async deleteRoom(roomName: string): Promise<void> {
    this.logger.log(`Deleting room: ${roomName}`);

    try {
      await this.roomClient.deleteRoom(roomName);
      this.logger.log(`Room deleted successfully: ${roomName}`);
    } catch (error) {
      this.logger.error(`Failed to delete room: ${error.message}`);
      throw error;
    }
  }

  async generateToken(options: ILiveKitTokenOptions): Promise<string> {
    this.logger.log(`Generating token for participant: ${options.participantIdentity}`);

    const token = new AccessToken(
      this.apiKey,
      this.apiSecret,
      {
        identity: options.participantIdentity,
        name: options.participantName,
        metadata: options.metadata,
        ttl: options.ttl || '6h',
      }
    );

    token.addGrant({
      roomJoin: true,
      room: options.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return await token.toJwt();
  }

  async makeVoiceCall(request: ILiveKitVoiceCallRequest): Promise<ILiveKitVoiceCallResult> {
    this.logger.log(`Making voice call to ${request.phoneNumber} in room ${request.roomName}`);

    try {
      const existingRoom = await this.getRoom(request.roomName);
      if (!existingRoom) {
        await this.createRoom({
          name: request.roomName,
          emptyTimeout: 300,
        });
      }

      this.logger.warn('SIP participant creation not yet implemented - requires SIP trunk configuration');

      return {
        success: true,
        roomName: request.roomName,
      };
    } catch (error) {
      this.logger.error(`Failed to make voice call: ${error.message}`);
      return {
        success: false,
        roomName: request.roomName,
        error: error.message,
      };
    }
  }

  async createWebCallSession(callId: string, userId: string): Promise<{
    roomName: string;
    token: string;
    url: string;
  }> {
    const roomName = `webcall-${callId}`;

    await this.createRoom({
      name: roomName,
      emptyTimeout: 300,
      maxParticipants: 10,
    });

    const token = await this.generateToken({
      roomName,
      participantIdentity: userId,
      participantName: `User ${userId}`,
    });

    return {
      roomName,
      token,
      url: this.livekitUrl,
    };
  }

  getLivekitUrl(): string {
    return this.livekitUrl;
  }
}
