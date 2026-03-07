import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { QueueService } from './queue.service';
import { QueueProcessor } from './queue.processor';
import { AiModule } from '../ai/ai.module';
import { Call, CallSchema, CallTemplate, CallTemplateSchema } from '../calls/schemas';

@Global()
@Module({
  imports: [
    ConfigModule,
    AiModule,
    MongooseModule.forFeature([
      { name: Call.name, schema: CallSchema },
      { name: CallTemplate.name, schema: CallTemplateSchema },
    ]),
  ],
  providers: [QueueService, QueueProcessor],
  exports: [QueueService],
})
export class QueueModule {}
