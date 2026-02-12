import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel, Content } from '@google/generative-ai';

export type GeminiAgentKey = 'itinerary' | 'personal';

interface GeminiCallOptions {
  agentKey: GeminiAgentKey;
  systemPrompt: string;
  conversationHistory: Content[];
  userMessage: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}

interface GeminiResponse {
  text: string;
  tokenCount?: number;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private models: Map<GeminiAgentKey, GenerativeModel> = new Map();

  constructor(private configService: ConfigService) {
    this.initModels();
  }

  private initModels() {
    const itineraryKey = this.configService.get<string>('GEMINI_ITINERARY');
    const personalKey = this.configService.get<string>('GEMINI_PERSONAL');
    const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';

    if (itineraryKey) {
      const genAI = new GoogleGenerativeAI(itineraryKey);
      this.models.set('itinerary', genAI.getGenerativeModel({ model: modelName }));
      this.logger.log(`Gemini Itinerary model initialized (${modelName})`);
    } else {
      this.logger.warn('GEMINI_ITINERARY API key not configured');
    }

    if (personalKey) {
      const genAI = new GoogleGenerativeAI(personalKey);
      this.models.set('personal', genAI.getGenerativeModel({ model: modelName }));
      this.logger.log(`Gemini Personal model initialized (${modelName})`);
    } else {
      this.logger.warn('GEMINI_PERSONAL API key not configured');
    }
  }

  async sendMessage(options: GeminiCallOptions): Promise<GeminiResponse> {
    const {
      agentKey,
      systemPrompt,
      conversationHistory,
      userMessage,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    const model = this.models.get(agentKey);
    if (!model) {
      throw new Error(`Gemini model not initialized for agent: ${agentKey}. Check API key configuration.`);
    }

    try {
      const chat = model.startChat({
        history: conversationHistory,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
        },
        systemInstruction: systemPrompt,
      });

      const result = await chat.sendMessage(userMessage);
      const response = result.response;
      const text = response.text();

      return {
        text,
        tokenCount: response.usageMetadata?.totalTokenCount,
      };
    } catch (error: any) {
      this.logger.error(`Gemini API error [${agentKey}]: ${error.message}`, error.stack);

      // Retry once on transient errors
      if (this.isRetryable(error)) {
        this.logger.log(`Retrying Gemini API call for [${agentKey}]...`);
        await this.delay(1000);
        return this.sendMessageRetry(options);
      }

      throw new Error(`AI service temporarily unavailable. Please try again.`);
    }
  }

  private async sendMessageRetry(options: GeminiCallOptions): Promise<GeminiResponse> {
    const { agentKey, systemPrompt, conversationHistory, userMessage, maxTokens = 2048, temperature = 0.7 } = options;
    const model = this.models.get(agentKey)!;

    try {
      const chat = model.startChat({
        history: conversationHistory,
        generationConfig: { maxOutputTokens: maxTokens, temperature },
        systemInstruction: systemPrompt,
      });

      const result = await chat.sendMessage(userMessage);
      const text = result.response.text();
      return { text, tokenCount: result.response.usageMetadata?.totalTokenCount };
    } catch (error: any) {
      this.logger.error(`Gemini retry failed [${agentKey}]: ${error.message}`);
      throw new Error('AI service temporarily unavailable. Please try again.');
    }
  }

  private isRetryable(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    return (
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('503') ||
      message.includes('timeout') ||
      message.includes('unavailable')
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
