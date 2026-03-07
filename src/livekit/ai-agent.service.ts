import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteAudioTrack,
  AudioFrame,
  TrackKind,
  DataPacketKind,
} from '@livekit/rtc-node';
import OpenAI from 'openai';
import { Readable } from 'stream';

interface IAgentConfig {
  roomUrl: string;
  token: string;
  roomName: string;
  systemPrompt?: string;
}

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);
  private openai: OpenAI;
  private activeAgents = new Map<string, Room>();

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async spawnAgent(config: IAgentConfig): Promise<void> {
    this.logger.log(`Spawning AI agent for room: ${config.roomName}`);

    try {
      const room = new Room();

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        this.logger.log(`👤 Participant connected: ${participant.identity}`);
        this.logger.log(`📊 Room state - Participants: ${room.numParticipants}`);
        this.greetUser(room);
      });

      room.on(RoomEvent.TrackSubscribed, (
        track: RemoteTrack,
        publication: any,
        participant: RemoteParticipant,
      ) => {
        if (track.kind === TrackKind.KIND_AUDIO) {
          this.logger.log(`Audio track subscribed from: ${participant.identity}`);
          this.handleAudioTrack(track as RemoteAudioTrack, room, config);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        this.logger.log(`Agent disconnected from room: ${config.roomName}`);
        this.activeAgents.delete(config.roomName);
      });

      await room.connect(config.roomUrl, config.token);
      this.activeAgents.set(config.roomName, room);

      this.logger.log(`AI agent connected to room: ${config.roomName}`);

      setTimeout(() => {
        this.logger.log(`🔍 Checking for existing participants in room...`);
        if (room.numParticipants > 1) {
          this.logger.log(`✅ Found ${room.numParticipants - 1} participant(s) already in room`);
          this.greetUser(room);
        } else {
          this.logger.log(`⏳ No participants yet, waiting for someone to join...`);
        }
      }, 2000);
    } catch (error) {
      this.logger.error(`Failed to spawn agent: ${error.message}`);
      throw error;
    }
  }

  private async greetUser(room: Room): Promise<void> {
    this.logger.log('🎤 Greeting user...');
    const greeting = "Hello! Thanks for calling. How can I help you today?";
    await this.speak(room, greeting);
    this.logger.log('✅ Greeting completed');
  }

  private async handleAudioTrack(
    track: RemoteAudioTrack,
    room: Room,
    config: IAgentConfig,
  ): Promise<void> {
    const audioBuffer: Buffer[] = [];
    let isProcessing = false;
    let silenceTimer: NodeJS.Timeout | null = null;

    const processAudio = async () => {
      if (isProcessing || audioBuffer.length === 0) return;

      isProcessing = true;
      const audioData = Buffer.concat(audioBuffer);
      audioBuffer.length = 0;

      try {
        const transcript = await this.transcribeAudio(audioData);

        if (transcript && transcript.trim().length > 0) {
          this.logger.log(`User said: ${transcript}`);

          const response = await this.generateResponse(transcript, config.systemPrompt);
          this.logger.log(`Agent responding: ${response}`);

          await this.speak(room, response);
        }
      } catch (error) {
        this.logger.error(`Error processing audio: ${error.message}`);
      } finally {
        isProcessing = false;
      }
    };

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        processAudio();
      }, 1500);
    };

    resetSilenceTimer();
  }

  private async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      this.logger.log(`🎧 Transcribing audio (${audioBuffer.length} bytes)...`);

      const uint8Array = new Uint8Array(audioBuffer);
      const blob = new Blob([uint8Array], { type: 'audio/wav' });
      const audioFile = new File([blob], 'audio.wav', { type: 'audio/wav' });

      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'en',
      });

      this.logger.log(`✅ Transcription: "${transcription.text}"`);
      return transcription.text;
    } catch (error) {
      this.logger.error(`❌ Transcription error: ${error.message}`);
      this.logger.error(error.stack);
      return '';
    }
  }

  private async generateResponse(userMessage: string, systemPrompt?: string): Promise<string> {
    try {
      this.logger.log(`🤖 Generating response for: "${userMessage}"`);

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: systemPrompt || 'You are a helpful customer service agent. Be brief and friendly.',
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      });

      const response = completion.choices[0].message.content || 'I apologize, I did not understand that.';
      this.logger.log(`✅ GPT-4 response: "${response}"`);
      return response;
    } catch (error) {
      this.logger.error(`❌ LLM error: ${error.message}`);
      this.logger.error(error.stack);
      return 'I apologize, I encountered an error. Could you please repeat that?';
    }
  }

  private async speak(room: Room, text: string): Promise<void> {
    try {
      this.logger.log(`🔊 Speaking: "${text}"`);

      this.logger.log('📞 Calling OpenAI TTS API...');
      const mp3Response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: text,
        response_format: 'mp3',
      });
      this.logger.log('✅ TTS audio generated successfully');

      const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());
      this.logger.log(`📦 Audio buffer size: ${audioBuffer.length} bytes`);

      if (room.localParticipant) {
        this.logger.log('📤 Publishing audio data to room...');
        await room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: 'agent_speaking', text })),
          { reliable: true },
        );
        this.logger.log('✅ Audio data published to room');
      } else {
        this.logger.error('❌ No local participant to publish audio');
      }

      this.logger.log('🎵 Speech completed');
    } catch (error) {
      this.logger.error(`❌ TTS error: ${error.message}`);
      this.logger.error(error.stack);
    }
  }

  async disconnectAgent(roomName: string): Promise<void> {
    const room = this.activeAgents.get(roomName);
    if (room) {
      await room.disconnect();
      this.activeAgents.delete(roomName);
      this.logger.log(`Agent disconnected from room: ${roomName}`);
    }
  }

  getActiveAgentsCount(): number {
    return this.activeAgents.size;
  }
}
