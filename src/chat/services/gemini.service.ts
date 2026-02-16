import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel, Content } from '@google/generative-ai';

export type GeminiAgentKey = 'itinerary' | 'personal';

export interface GeminiChatOptions {
  agentKey: GeminiAgentKey;
  systemPrompt: string;
  conversationHistory: Content[];
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GeminiResponse {
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

  /**
   * Main chat method — sends a message with conversation history to Gemini.
   * Includes automatic fallback to alternate API key on rate limit errors.
   */
  async chat(options: GeminiChatOptions): Promise<GeminiResponse> {
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

    // Convert system prompt to Content object (required by gemini-2.5+)
    const systemInstruction = { role: 'user' as const, parts: [{ text: systemPrompt }] };

    try {
      const chat = model.startChat({
        history: conversationHistory,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
        },
        systemInstruction,
      });

      const result = await chat.sendMessage(userMessage);
      const response = result.response;

      return {
        text: response.text(),
        tokenCount: response.usageMetadata?.totalTokenCount,
      };
    } catch (error: any) {
      // Enhanced logging for better debugging
      this.logger.error(`Gemini API error [${agentKey}]: ${error.message}`, {
        status: error?.status || error?.code,
        details: error?.details || error?.response?.data,
        stack: error.stack
      });

      // Try fallback key on rate limit errors
      if (this.isRateLimitError(error)) {
        this.logger.log(`Rate limit hit for [${agentKey}], trying fallback key...`);
        const fallbackResponse = await this.tryFallbackKey(options);
        if (fallbackResponse) return fallbackResponse;
      }

      // Retry once on other transient errors
      if (this.isRetryable(error)) {
        this.logger.log(`Retrying Gemini API call for [${agentKey}]...`);
        await this.delay(1500);
        return this.chatRetry(options);
      }

      // More specific error message
      let userMessage = "AI service temporarily unavailable. Please try again.";
      const errorMsg = error?.message?.toLowerCase() || '';
      
      if (this.isRateLimitError(error)) {
        userMessage = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (errorMsg.includes('quota')) {
        userMessage = "Daily quota exceeded. Please try again tomorrow or contact support.";
      }

      throw new Error(userMessage);
    }
  }

  /**
   * Lightweight JSON extraction — single-turn, no history.
   * Used for extracting structured data (e.g. destination) from user messages.
   * Includes automatic fallback to alternate API key on rate limit errors.
   */
  async extractJson(agentKey: GeminiAgentKey, prompt: string, userMessage: string): Promise<any> {
    const model = this.models.get(agentKey);
    if (!model) return null;

    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        systemInstruction: { role: 'user' as const, parts: [{ text: prompt }] },
        generationConfig: { maxOutputTokens: 256, temperature: 0.1 },
      });

      const text = result.response.text().trim();
      return this.parseJson(text);
    } catch (error: any) {
      // Try fallback key on rate limit errors
      if (this.isRateLimitError(error)) {
        const fallbackKey: GeminiAgentKey = agentKey === 'itinerary' ? 'personal' : 'itinerary';
        const fallbackModel = this.models.get(fallbackKey);
        
        if (fallbackModel) {
          try {
            this.logger.log(`JSON extraction using fallback key [${fallbackKey}]`);
            const result = await fallbackModel.generateContent({
              contents: [{ role: 'user', parts: [{ text: userMessage }] }],
              systemInstruction: { role: 'user' as const, parts: [{ text: prompt }] },
              generationConfig: { maxOutputTokens: 256, temperature: 0.1 },
            });
            const text = result.response.text().trim();
            return this.parseJson(text);
          } catch (fallbackError: any) {
            this.logger.warn(`Fallback JSON extraction also failed: ${fallbackError.message}`);
          }
        }
      }
      
      this.logger.warn(`JSON extraction failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse JSON from text — handles markdown-wrapped JSON blocks.
   */
  parseJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      // Try extracting from ```json ... ``` blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try { return JSON.parse(jsonMatch[1].trim()); } catch {}
      }
      // Try extracting a raw JSON object
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try { return JSON.parse(objectMatch[0]); } catch {}
      }
      return null;
    }
  }

  private async chatRetry(options: GeminiChatOptions): Promise<GeminiResponse> {
    const { agentKey, systemPrompt, conversationHistory, userMessage, maxTokens = 2048, temperature = 0.7 } = options;
    const model = this.models.get(agentKey)!;

    try {
      const chat = model.startChat({
        history: conversationHistory,
        generationConfig: { maxOutputTokens: maxTokens, temperature },
        systemInstruction: { role: 'user' as const, parts: [{ text: systemPrompt }] },
      });

      const result = await chat.sendMessage(userMessage);
      return {
        text: result.response.text(),
        tokenCount: result.response.usageMetadata?.totalTokenCount,
      };
    } catch (error: any) {
      this.logger.error(`Gemini retry failed [${agentKey}]: ${error.message}`);
      throw new Error('AI service temporarily unavailable. Please try again.');
    }
  }

  private isRetryable(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    const status = error?.status || error?.code || 0;
    return (
      message.includes('503') ||
      message.includes('timeout') ||
      message.includes('unavailable') ||
      message.includes('overloaded') ||
      message.includes('internal') ||
      status === 503 ||
      status === 500
    );
  }

  private isRateLimitError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    const status = error?.status || error?.code || 0;
    return (
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('429') ||
      message.includes('resource exhausted') ||
      status === 429
    );
  }

  /**
   * Try the alternate API key when primary key hits rate limits
   */
  private async tryFallbackKey(options: GeminiChatOptions): Promise<GeminiResponse | null> {
    const { agentKey, systemPrompt, conversationHistory, userMessage, maxTokens = 2048, temperature = 0.7 } = options;
    
    // Determine fallback key
    const fallbackKey: GeminiAgentKey = agentKey === 'itinerary' ? 'personal' : 'itinerary';
    const fallbackModel = this.models.get(fallbackKey);
    
    if (!fallbackModel) {
      this.logger.warn(`Fallback key [${fallbackKey}] not available`);
      return null;
    }

    try {
      this.logger.log(`Using fallback key [${fallbackKey}] for request`);
      const chat = fallbackModel.startChat({
        history: conversationHistory,
        generationConfig: { maxOutputTokens: maxTokens, temperature },
        systemInstruction: { role: 'user' as const, parts: [{ text: systemPrompt }] },
      });

      const result = await chat.sendMessage(userMessage);
      return {
        text: result.response.text(),
        tokenCount: result.response.usageMetadata?.totalTokenCount,
      };
    } catch (error: any) {
      this.logger.error(`Fallback key [${fallbackKey}] also failed: ${error.message}`);
      return null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
