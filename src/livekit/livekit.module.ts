import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LiveKitService } from './livekit.service';
import { LiveKitController } from './livekit.controller';
import { AiAgentService } from './ai-agent.service';

@Module({
  imports: [ConfigModule],
  controllers: [LiveKitController],
  providers: [LiveKitService, AiAgentService],
  exports: [LiveKitService, AiAgentService],
})
export class LiveKitModule {}
