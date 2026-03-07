import { Controller, Post, Param, Body, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { Call, CallDocument, CallStatus, CallTemplate, CallTemplateDocument } from './schemas';

interface ITwilioVoiceWebhook {
  CallSid: string;
  From: string;
  To: string;
  CallStatus: string;
  Direction: string;
}

interface ITwilioStatusWebhook {
  CallSid: string;
  CallStatus: string;
  CallDuration?: string;
  RecordingUrl?: string;
}

interface ITwilioRecordingWebhook {
  CallSid: string;
  RecordingSid: string;
  RecordingUrl: string;
  RecordingStatus: string;
  RecordingDuration: string;
}

interface ITwilioGatherWebhook {
  CallSid: string;
  SpeechResult?: string;
  Confidence?: string;
}

interface IConversationHistory {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

@Controller('calls/webhook')
export class TwilioWebhookController {
  private readonly logger = new Logger(TwilioWebhookController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    @InjectModel(Call.name) private callModel: Model<CallDocument>,
    @InjectModel(CallTemplate.name) private templateModel: Model<CallTemplateDocument>,
  ) {}

  @Post('voice/:callId')
  async handleVoiceWebhook(
    @Param('callId') callId: string,
    @Body() twilioData: ITwilioVoiceWebhook,
    @Res() res: Response,
  ) {
    this.logger.log(`Voice webhook for call ${callId}, Twilio SID: ${twilioData.CallSid}`);

    try {
      const call = await this.callModel.findById(callId);
      if (!call) {
        this.logger.error(`Call ${callId} not found`);
        return this.sendErrorResponse(res);
      }

      let initialMessage = 'Hi! This is an AI assistant calling. How can I help you today?';
      let systemPrompt = 'You are a helpful AI assistant making a phone call.';

      if (call.templateId) {
        const template = await this.templateModel.findById(call.templateId);
        if (template) {
          systemPrompt = this.replaceVariables(template.systemPrompt, call.variables || {});

          const conversationResponse = await this.aiService.generateConversationResponse({
            systemPrompt,
            messages: [
              {
                role: 'user',
                content: 'Generate the initial greeting for this call. Keep it brief and friendly.',
              },
            ],
          });

          initialMessage = conversationResponse.message;
        }
      }

      const conversationHistory: IConversationHistory[] = [
        {
          role: 'system',
          content: systemPrompt,
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: initialMessage,
          timestamp: new Date(),
        },
      ];

      await this.callModel.updateOne(
        { _id: new Types.ObjectId(callId) },
        {
          status: CallStatus.IN_PROGRESS,
          externalCallId: twilioData.CallSid,
          startedAt: new Date(),
          callData: { conversationHistory, systemPrompt },
        },
      );

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${this.escapeXml(initialMessage)}</Say>
  <Gather input="speech" action="/calls/webhook/gather/${callId}" method="POST" speechTimeout="auto" timeout="5" language="en-US">
    <Pause length="1"/>
  </Gather>
  <Say voice="Polly.Joanna">I didn't hear a response. Goodbye!</Say>
  <Hangup/>
</Response>`;

      res.type('text/xml');
      res.send(twiml);
    } catch (error) {
      this.logger.error(`Error in voice webhook: ${error.message}`);
      this.sendErrorResponse(res);
    }
  }

  @Post('gather/:callId')
  async handleGatherWebhook(
    @Param('callId') callId: string,
    @Body() twilioData: ITwilioGatherWebhook,
    @Res() res: Response,
  ) {
    this.logger.log(`Gather webhook for call ${callId}`);
    this.logger.log(`Speech result: ${twilioData.SpeechResult}`);

    try {
      const call = await this.callModel.findById(callId);
      if (!call) {
        this.logger.error(`Call ${callId} not found`);
        return this.sendErrorResponse(res);
      }

      const customerSaid = twilioData.SpeechResult || '';
      if (!customerSaid) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I'm sorry, I didn't catch that. Could you please repeat?</Say>
  <Gather input="speech" action="/calls/webhook/gather/${callId}" method="POST" speechTimeout="auto" timeout="5" language="en-US">
    <Pause length="1"/>
  </Gather>
  <Say voice="Polly.Joanna">I still didn't hear anything. Goodbye!</Say>
  <Hangup/>
</Response>`;
        return res.type('text/xml').send(twiml);
      }

      const callData = (call.callData as any) || {};
      const conversationHistory: IConversationHistory[] = callData.conversationHistory || [];
      const systemPrompt = callData.systemPrompt || 'You are a helpful AI assistant.';

      conversationHistory.push({
        role: 'user',
        content: customerSaid,
        timestamp: new Date(),
      });

      const messages = conversationHistory
        .filter((msg) => msg.role !== 'system')
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      const conversationResponse = await this.aiService.generateConversationResponse({
        systemPrompt,
        messages,
      });

      conversationHistory.push({
        role: 'assistant',
        content: conversationResponse.message,
        timestamp: new Date(),
      });

      const transcriptText = conversationHistory
        .filter((msg) => msg.role !== 'system')
        .map((msg) => `${msg.role === 'user' ? 'Customer' : 'AI'}: ${msg.content}`)
        .join('\n');

      await this.callModel.updateOne(
        { _id: new Types.ObjectId(callId) },
        {
          callData: { ...callData, conversationHistory },
          transcriptText,
        },
      );

      if (conversationResponse.shouldEndCall) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${this.escapeXml(conversationResponse.message)}</Say>
  <Hangup/>
</Response>`;
        return res.type('text/xml').send(twiml);
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${this.escapeXml(conversationResponse.message)}</Say>
  <Gather input="speech" action="/calls/webhook/gather/${callId}" method="POST" speechTimeout="auto" timeout="5" language="en-US">
    <Pause length="1"/>
  </Gather>
  <Say voice="Polly.Joanna">I didn't hear you. Thank you for your time. Goodbye!</Say>
  <Hangup/>
</Response>`;

      res.type('text/xml').send(twiml);
    } catch (error) {
      this.logger.error(`Error in gather webhook: ${error.message}`);
      this.sendErrorResponse(res);
    }
  }

  @Post('status/:callId')
  async handleStatusWebhook(
    @Param('callId') callId: string,
    @Body() twilioData: ITwilioStatusWebhook,
  ) {
    this.logger.log(`Status webhook for call ${callId}: ${twilioData.CallStatus}`);
    this.logger.log(`Twilio Call SID: ${twilioData.CallSid}`);

    try {
      const statusMap: Record<string, CallStatus> = {
        queued: CallStatus.QUEUED,
        initiated: CallStatus.RINGING,
        ringing: CallStatus.RINGING,
        'in-progress': CallStatus.IN_PROGRESS,
        completed: CallStatus.COMPLETED,
        busy: CallStatus.BUSY,
        failed: CallStatus.FAILED,
        'no-answer': CallStatus.NO_ANSWER,
        canceled: CallStatus.CANCELLED,
      };

      const status = statusMap[twilioData.CallStatus] || CallStatus.IN_PROGRESS;
      const updateData: any = { status, externalCallId: twilioData.CallSid };

      if (twilioData.CallDuration) {
        updateData.duration = parseInt(twilioData.CallDuration, 10);
      }

      if (status === CallStatus.COMPLETED || status === CallStatus.FAILED || status === CallStatus.NO_ANSWER) {
        updateData.endedAt = new Date();
      }

      await this.callModel.updateOne({ _id: new Types.ObjectId(callId) }, updateData);

      return { message: 'Status received' };
    } catch (error) {
      this.logger.error(`Error updating call status: ${error.message}`);
      return { message: 'Error processing status' };
    }
  }

  @Post('recording/:callId')
  async handleRecordingWebhook(
    @Param('callId') callId: string,
    @Body() twilioData: ITwilioRecordingWebhook,
  ) {
    this.logger.log(`Recording webhook for call ${callId}`);
    this.logger.log(`Recording URL: ${twilioData.RecordingUrl}`);
    this.logger.log(`Recording Duration: ${twilioData.RecordingDuration}s`);

    try {
      const twilioRecordingUrl = `${twilioData.RecordingUrl}.mp3`;

      this.logger.log(`Downloading recording from Twilio: ${twilioRecordingUrl}`);
      const response = await fetch(twilioRecordingUrl);

      if (!response.ok) {
        throw new Error(`Failed to download recording: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const recordingBuffer = Buffer.from(arrayBuffer);

      this.logger.log(`Uploading recording to R2 for call ${callId}`);
      const uploadResult = await this.storageService.uploadCallRecording(recordingBuffer, callId);

      this.logger.log(`Recording uploaded to R2: ${uploadResult.url}`);

      await this.callModel.updateOne(
        { _id: new Types.ObjectId(callId) },
        {
          recordingUrl: uploadResult.url,
        },
      );

      return { message: 'Recording received' };
    } catch (error) {
      this.logger.error(`Error saving recording: ${error.message}`);
      return { message: 'Error processing recording' };
    }
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private replaceVariables(template: string, variables: Record<string, any>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    }
    return result;
  }

  private sendErrorResponse(res: Response): void {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I apologize, but I encountered an error. Please try again later. Goodbye!</Say>
  <Hangup/>
</Response>`;
    res.type('text/xml').send(twiml);
  }
}
