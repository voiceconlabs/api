import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteAudioTrack,
  TrackKind,
  LocalAudioTrack,
  AudioSource,
  AudioFrame,
  TrackSource,
  TrackPublishOptions,
  AudioStream,
} from '@livekit/rtc-node';
import OpenAI from 'openai';
import { createClient } from '@deepgram/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

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
  private deepgram: any;
  private cloudflareAccountId: string;
  private cloudflareApiToken: string;
  private activeAgents = new Map<string, { room: Room; audioSource: AudioSource }>();

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });

    const deepgramApiKey = this.configService.get('DEEPGRAM_API_KEY');
    if (deepgramApiKey) {
      this.deepgram = createClient(deepgramApiKey);
    }

    this.cloudflareAccountId = this.configService.get('CLOUDFLARE_ACCOUNT_ID') || '';
    this.cloudflareApiToken = this.configService.get('CLOUDFLARE_API_TOKEN') || '';
  }

  async spawnAgent(config: IAgentConfig): Promise<void> {
    this.logger.log(`Spawning AI agent for room: ${config.roomName}`);

    try {
      const room = new Room();
      const audioSource = new AudioSource(48000, 1);
      const audioTrack = LocalAudioTrack.createAudioTrack('agent-audio', audioSource);
      let hasGreeted = false;

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        this.logger.log(`👤 Participant connected: ${participant.identity}`);
        this.logger.log(`📊 Room state - Participants: ${room.numParticipants}`);
        if (!hasGreeted) {
          hasGreeted = true;
          this.greetUser(room, audioSource);
        }
      });

      room.on(RoomEvent.TrackSubscribed, (
        track: RemoteTrack,
        publication: any,
        participant: RemoteParticipant,
      ) => {
        if (track.kind === TrackKind.KIND_AUDIO) {
          this.logger.log(`Audio track subscribed from: ${participant.identity}`);
          if (!hasGreeted) {
            hasGreeted = true;
            this.greetUser(room, audioSource);
          }
          this.handleAudioTrack(track as RemoteAudioTrack, room, audioSource, config);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        this.logger.log(`Agent disconnected from room: ${config.roomName}`);
        this.activeAgents.delete(config.roomName);
      });

      await room.connect(config.roomUrl, config.token);
      this.activeAgents.set(config.roomName, { room, audioSource });

      this.logger.log(`AI agent connected to room: ${config.roomName}`);

      const publishOptions = new TrackPublishOptions();
      publishOptions.source = TrackSource.SOURCE_MICROPHONE;

      const publication = await room.localParticipant!.publishTrack(audioTrack, publishOptions);
      this.logger.log(`✅ Audio track published: ${publication.sid}`);

      setTimeout(() => {
        this.logger.log(`🔍 Checking for existing participants in room...`);
        const remoteParticipantCount = room.remoteParticipants.size;
        this.logger.log(`📊 Remote participants: ${remoteParticipantCount}`);
        if (remoteParticipantCount > 0 && !hasGreeted) {
          this.logger.log(`✅ Found ${remoteParticipantCount} participant(s) already in room`);
          hasGreeted = true;
          this.greetUser(room, audioSource);
        } else if (remoteParticipantCount === 0) {
          this.logger.log(`⏳ No participants yet, waiting for someone to join...`);
        }
      }, 2000);
    } catch (error) {
      this.logger.error(`Failed to spawn agent: ${error.message}`);
      throw error;
    }
  }

  private async greetUser(room: Room, audioSource: AudioSource): Promise<void> {
    this.logger.log('🎤 Greeting user...');
    const greeting = "Hello! Thanks for calling. How can I help you today?";
    await this.speak(room, audioSource, greeting);
    this.logger.log('✅ Greeting completed');
  }

  private async handleAudioTrack(
    track: RemoteAudioTrack,
    room: Room,
    audioSource: AudioSource,
    config: IAgentConfig,
  ): Promise<void> {
    this.logger.log('🎧 Starting audio track handler...');

    const audioBuffer: Buffer[] = [];
    let isProcessing = false;
    let silenceTimer: NodeJS.Timeout | null = null;
    let hasAudio = false;
    const SILENCE_THRESHOLD = 500;
    const SILENCE_TIMEOUT = 800;
    const MAX_BUFFER_SIZE = 5 * 48000 * 2;

    const processAudio = async () => {
      if (isProcessing || audioBuffer.length === 0 || !hasAudio) return;

      isProcessing = true;
      const audioData = Buffer.concat(audioBuffer);
      audioBuffer.length = 0;
      hasAudio = false;

      try {
        this.logger.log(`📊 Processing ${audioData.length} bytes of audio`);
        const transcript = await this.transcribeAudio(audioData);

        if (transcript && transcript.trim().length > 0) {
          this.logger.log(`User said: ${transcript}`);

          const response = await this.generateResponse(transcript, config.systemPrompt);
          this.logger.log(`Agent responding: ${response}`);

          await this.speak(room, audioSource, response);
        }
      } catch (error) {
        this.logger.error(`Error processing audio: ${error.message}`);
      } finally {
        isProcessing = false;
      }
    };

    const checkSilence = (audioData: Int16Array): boolean => {
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        sum += Math.abs(audioData[i]);
      }
      const average = sum / audioData.length;
      return average > SILENCE_THRESHOLD;
    };

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        this.logger.log('⏱️ Silence detected, processing audio...');
        processAudio();
      }, SILENCE_TIMEOUT);
    };

    try {
      const audioStream = new AudioStream(track, 48000, 1);
      this.logger.log('✅ Audio stream created, listening for frames...');

      const reader = audioStream.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this.logger.log('🔚 Audio stream ended');
          if (audioBuffer.length > 0) {
            await processAudio();
          }
          break;
        }

        if (value) {
          const int16Data = value.data;
          const buffer = Buffer.from(int16Data.buffer, int16Data.byteOffset, int16Data.byteLength);

          const isAudio = checkSilence(int16Data);

          if (isAudio) {
            hasAudio = true;
            audioBuffer.push(buffer);

            const totalSize = audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
            if (totalSize > MAX_BUFFER_SIZE) {
              this.logger.warn('⚠️ Buffer too large, processing early');
              if (silenceTimer) clearTimeout(silenceTimer);
              await processAudio();
            } else {
              resetSilenceTimer();
            }
          } else if (hasAudio) {
            audioBuffer.push(buffer);
          }
        }
      }
    } catch (error) {
      this.logger.error(`❌ Audio stream error: ${error.message}`);
      this.logger.error(error.stack);
    }
  }

  private async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      this.logger.log(`🎧 Transcribing audio (${audioBuffer.length} bytes) with Deepgram...`);

      const transcript = await this.transcribeWithDeepgram(audioBuffer);
      this.logger.log(`✅ Deepgram transcription: "${transcript}"`);
      return transcript;

    } catch (error) {
      this.logger.error(`❌ Transcription error: ${error.message}`);
      this.logger.error(error.stack);
      return '';
    }
  }

  private async transcribeWithCloudflare(audioBuffer: Buffer): Promise<string> {
    const formData = new FormData();
    const uint8Array = new Uint8Array(audioBuffer);
    const blob = new Blob([uint8Array], { type: 'audio/wav' });
    formData.append('audio', blob, 'audio.wav');

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.cloudflareAccountId}/ai/run/@cf/openai/whisper`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.cloudflareApiToken}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare API error: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    return result.result?.text || '';
  }

  private async transcribeWithDeepgram(audioBuffer: Buffer): Promise<string> {
    const wavBuffer = this.addWavHeader(audioBuffer, 48000, 1, 16);

    const { result, error } = await this.deepgram.listen.prerecorded.transcribeFile(
      wavBuffer,
      {
        model: 'nova-2',
        language: 'en',
        smart_format: true,
      }
    );

    if (error) {
      throw new Error(`Deepgram error: ${JSON.stringify(error)}`);
    }

    return result.results?.channels[0]?.alternatives[0]?.transcript || '';
  }

  private addWavHeader(pcmBuffer: Buffer, sampleRate: number, numChannels: number, bitsPerSample: number): Buffer {
    const dataSize = pcmBuffer.length;
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
    header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  private async generateResponse(userMessage: string, systemPrompt?: string): Promise<string> {
    try {
      this.logger.log(`🤖 Generating response for: "${userMessage}"`);

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt || 'You are a helpful customer service agent. Be brief and friendly. Keep responses under 2 sentences.',
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        max_tokens: 100,
        temperature: 0.7,
      });

      const response = completion.choices[0].message.content || 'I apologize, I did not understand that.';
      this.logger.log(`✅ GPT-4o-mini response: "${response}"`);
      return response;
    } catch (error) {
      this.logger.error(`❌ LLM error: ${error.message}`);
      this.logger.error(error.stack);
      return 'I apologize, I encountered an error. Could you please repeat that?';
    }
  }

  private async speak(room: Room, audioSource: AudioSource, text: string): Promise<void> {
    try {
      this.logger.log(`🔊 Speaking: "${text}"`);
      this.logger.log('📞 Calling Deepgram TTS API...');

      const response = await this.deepgram.speak.request(
        { text },
        {
          model: 'aura-asteria-en',
          encoding: 'linear16',
          container: 'none',
          sample_rate: 48000,
        }
      );

      const stream = await response.getStream();
      if (!stream) {
        throw new Error('No audio stream received from Deepgram');
      }

      const chunks: Buffer[] = [];
      const reader = stream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }

      const audioBuffer = Buffer.concat(chunks);
      this.logger.log(`✅ TTS audio generated successfully`);
      this.logger.log(`📦 Audio buffer size: ${audioBuffer.length} bytes`);

      const sampleRate = 48000;
      const numChannels = 1;
      const numSamples = audioBuffer.length / 2;

      const int16Array = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, numSamples);

      const audioFrame = new AudioFrame(
        int16Array,
        sampleRate,
        numChannels,
        numSamples,
      );

      await audioSource.captureFrame(audioFrame);
      this.logger.log('✅ Audio frame captured and published to track');

      await new Promise(resolve => setTimeout(resolve, (numSamples / sampleRate) * 1000));

      this.logger.log('🎵 Speech completed');
    } catch (error) {
      this.logger.error(`❌ TTS error: ${error.message}`);
      this.logger.error(error.stack);
    }
  }

  async disconnectAgent(roomName: string): Promise<void> {
    const agent = this.activeAgents.get(roomName);
    if (agent) {
      await agent.room.disconnect();
      this.activeAgents.delete(roomName);
      this.logger.log(`Agent disconnected from room: ${roomName}`);
    }
  }

  getActiveAgentsCount(): number {
    return this.activeAgents.size;
  }
}
