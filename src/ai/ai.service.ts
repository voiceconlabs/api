import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ITranscriptSegment {
  speaker: string;
  speakerId: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface ITranscriptResult {
  segments: ITranscriptSegment[];
  fullText: string;
  language: string;
}

export interface ISummaryResult {
  overview: string;
  keyTakeaways: string[];
  actionItems: Array<{
    title: string;
    assignee?: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  decisions: string[];
  nextSteps: string[];
  topics: Array<{
    title: string;
    summary: string;
  }>;
  sentiment: 'positive' | 'neutral' | 'negative';
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID')!;
    this.apiToken = this.configService.get<string>('CLOUDFLARE_API_TOKEN')!;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run`;
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<ITranscriptResult> {
    this.logger.log('Starting audio transcription with Whisper');

    const response = await fetch(`${this.baseUrl}/@cf/openai/whisper`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: new Uint8Array(audioBuffer),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Transcription failed: ${error}`);
      throw new Error(`Transcription failed: ${error}`);
    }

    const result = await response.json();
    const whisperResult = result.result;

    const segments = this.processWhisperSegments(whisperResult);

    return {
      segments,
      fullText: whisperResult.text || '',
      language: whisperResult.language || 'en',
    };
  }

  private processWhisperSegments(whisperResult: any): ITranscriptSegment[] {
    if (!whisperResult.words || !Array.isArray(whisperResult.words)) {
      return [
        {
          speaker: 'Speaker 1',
          speakerId: 'speaker_1',
          text: whisperResult.text || '',
          startTime: 0,
          endTime: 0,
          confidence: 1,
        },
      ];
    }

    const segments: ITranscriptSegment[] = [];
    let currentSegment: ITranscriptSegment | null = null;
    let speakerCount = 1;

    for (const word of whisperResult.words) {
      if (!currentSegment || word.start - currentSegment.endTime > 2) {
        if (currentSegment) {
          segments.push(currentSegment);
        }
        currentSegment = {
          speaker: `Speaker ${speakerCount}`,
          speakerId: `speaker_${speakerCount}`,
          text: word.word,
          startTime: word.start,
          endTime: word.end,
          confidence: 1,
        };
        speakerCount = speakerCount === 1 ? 2 : 1;
      } else {
        currentSegment.text += ' ' + word.word;
        currentSegment.endTime = word.end;
      }
    }

    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments;
  }

  async generateSummary(transcript: string): Promise<ISummaryResult> {
    this.logger.log('Generating summary with Llama');

    const prompt = `You are an AI assistant that analyzes meeting transcripts. Given the following transcript, extract:
1. A brief overview (2-3 sentences)
2. Key takeaways (bullet points)
3. Action items with assignees if mentioned
4. Decisions made
5. Next steps
6. Main topics discussed
7. Overall sentiment (positive/neutral/negative)

Return the response as valid JSON with this structure:
{
  "overview": "string",
  "keyTakeaways": ["string"],
  "actionItems": [{"title": "string", "assignee": "string or null", "priority": "low|medium|high"}],
  "decisions": ["string"],
  "nextSteps": ["string"],
  "topics": [{"title": "string", "summary": "string"}],
  "sentiment": "positive|neutral|negative"
}

TRANSCRIPT:
${transcript}

JSON RESPONSE:`;

    const response = await fetch(`${this.baseUrl}/@cf/meta/llama-3.1-8b-instruct`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Summary generation failed: ${error}`);
      throw new Error(`Summary generation failed: ${error}`);
    }

    const result = await response.json();
    const llmResponse = result.result.response;

    try {
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      this.logger.warn('Failed to parse LLM response as JSON, using fallback');
    }

    return {
      overview: llmResponse,
      keyTakeaways: [],
      actionItems: [],
      decisions: [],
      nextSteps: [],
      topics: [],
      sentiment: 'neutral',
    };
  }

  async extractActionItems(transcript: string): Promise<ISummaryResult['actionItems']> {
    this.logger.log('Extracting action items');

    const prompt = `Extract action items from this meeting transcript. For each action item, identify:
- The task description
- Who it's assigned to (if mentioned)
- Priority (high/medium/low based on urgency mentioned)

Return as JSON array:
[{"title": "string", "assignee": "string or null", "priority": "low|medium|high"}]

TRANSCRIPT:
${transcript}

JSON RESPONSE:`;

    const response = await fetch(`${this.baseUrl}/@cf/meta/llama-3.1-8b-instruct`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const result = await response.json();
    const llmResponse = result.result.response;

    try {
      const jsonMatch = llmResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      this.logger.warn('Failed to parse action items');
    }

    return [];
  }
}
