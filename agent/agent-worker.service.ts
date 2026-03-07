import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type JobContext,
  type JobProcess,
  AgentServer,
  ServerOptions,
  defineAgent,
  inference,
  metrics,
  voice,
  initializeLogger,
} from '@livekit/agents';
import * as livekit from '@livekit/agents-plugin-livekit';
import * as silero from '@livekit/agents-plugin-silero';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import { Agent } from './agent';
import { writeFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class AgentWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentWorkerService.name);
  private vad: silero.VAD | null = null;
  private agentServer: AgentServer | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.logger.log('Initializing LiveKit Agent Worker...');

    initializeLogger({ pretty: true, level: 'info' });

    await this.preloadModels();
    await this.startAgentWorker();
  }

  private async preloadModels() {
    this.logger.log('Preloading VAD model...');
    this.vad = await silero.VAD.load();
    this.logger.log('VAD model loaded successfully');
  }

  private async startAgentWorker() {
    const livekitUrl = this.configService.get<string>('LIVEKIT_URL');
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (!livekitUrl || !apiKey || !apiSecret) {
      this.logger.error('Missing LiveKit credentials. Agent worker will not start.');
      return;
    }

    this.logger.log(`Starting agent worker connected to: ${livekitUrl}`);

    const agent = defineAgent({
      prewarm: async (proc: JobProcess) => {
        proc.userData.vad = this.vad;
      },
      entry: async (ctx: JobContext) => {
        const session = new voice.AgentSession({
          stt: new inference.STT({
            model: 'deepgram/nova-3',
            language: 'multi',
          }),

          llm: new inference.LLM({
            model: 'openai/gpt-4.1-mini',
          }),

          tts: new inference.TTS({
            model: 'cartesia/sonic-3',
            voice: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
          }),

          turnDetection: new livekit.turnDetector.MultilingualModel(),
          vad: ctx.proc.userData.vad! as silero.VAD,
          voiceOptions: {
            preemptiveGeneration: true,
          },
        });

        const usageCollector = new metrics.UsageCollector();
        session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
          metrics.logMetrics(ev.metrics);
          usageCollector.collect(ev.metrics);
        });

        const logUsage = async () => {
          const summary = usageCollector.getSummary();
          this.logger.log(`Usage: ${JSON.stringify(summary)}`);
        };

        ctx.addShutdownCallback(logUsage);

        await session.start({
          agent: new Agent(),
          room: ctx.room,
          inputOptions: {
            noiseCancellation: BackgroundVoiceCancellation(),
          },
        });

        await ctx.connect();

        session.generateReply({
          instructions: 'Greet the user in a helpful and friendly manner.',
        });
      },
    });

    try {
      const agentFilePath = join(__dirname, 'agent-entry.js');
      const agentCode = `
        const { defineAgent, inference, metrics, voice } = require('@livekit/agents');
        const livekit = require('@livekit/agents-plugin-livekit');
        const silero = require('@livekit/agents-plugin-silero');
        const { BackgroundVoiceCancellation } = require('@livekit/noise-cancellation-node');
        const { Agent } = require('./agent');

        module.exports = ${agent.toString()};
      `;

      writeFileSync(agentFilePath, agentCode);

      this.agentServer = new AgentServer(
        new ServerOptions({
          agent: agentFilePath,
          agentName: 'voiceconf-agent',
          wsURL: livekitUrl,
          apiKey,
          apiSecret,
        }),
      );

      await this.agentServer.run();

      this.logger.log('Agent worker started successfully');
      this.logger.log(`Worker ID: ${this.agentServer.id}`);
    } catch (error) {
      this.logger.error(`Failed to start agent worker: ${error.message}`);
      this.logger.error(error.stack);
    }
  }

  async onModuleDestroy() {
    if (this.agentServer) {
      this.logger.log('Shutting down agent worker...');
      await this.agentServer.close();
      this.logger.log('Agent worker shut down successfully');
    }
  }
}
