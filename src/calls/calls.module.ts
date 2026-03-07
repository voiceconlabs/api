import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { Call, CallSchema, CallTemplate, CallTemplateSchema } from './schemas';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Call.name, schema: CallSchema },
      { name: CallTemplate.name, schema: CallTemplateSchema },
    ]),
    forwardRef(() => QueueModule),
  ],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
