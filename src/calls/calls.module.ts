import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CallsController } from './calls.controller';
import { TwilioWebhookController } from './twilio-webhook.controller';
import { CallsService } from './calls.service';
import { Call, CallSchema, CallTemplate, CallTemplateSchema } from './schemas';
import { QueueModule } from '../queue/queue.module';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Call.name, schema: CallSchema },
      { name: CallTemplate.name, schema: CallTemplateSchema },
    ]),
    forwardRef(() => QueueModule),
    AiModule,
    StorageModule,
  ],
  controllers: [CallsController, TwilioWebhookController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
