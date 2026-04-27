import { Injectable, Logger } from '@nestjs/common';
import { Content } from '@google/generative-ai';
import { GeminiService } from './gemini.service';
import { WeatherService } from '../../weather/weather.service';
import {
  PERSONAL_ASSISTANT_SYSTEM_PROMPT,
  DESTINATION_EXTRACTION_PROMPT,
  buildWeatherContext,
  WeatherContext,
} from '../config/prompt-templates';

export interface AgentResponse {
  text: string;
  context: Record<string, any>;
  tokenCount?: number;
}

@Injectable()
export class PersonalAssistantService {
  private readonly logger = new Logger(PersonalAssistantService.name);

  constructor(
    private geminiService: GeminiService,
    private weatherService: WeatherService,
  ) {}

  /**
   * Process a user message — pure conversational flow.
   * No state machine, no questionnaire. Gemini drives the conversation.
   */
  async processMessage(
    userMessage: string,
    conversationHistory: Content[],
    sessionContext: Record<string, any>,
  ): Promise<AgentResponse> {
    // 1. Try to detect destination from user message (if not already known)
    const context = { ...sessionContext };
    if (!context.destination) {
      const extracted = this.extractDestinationLocal(userMessage) || await this.extractDestination(userMessage);
      if (extracted) {
        context.destination = extracted;
        this.logger.log(`Destination detected: ${extracted}`);
      }
    }

    // 2. Fetch weather if we have a destination
    let weatherBlock = '';
    if (context.destination) {
      const weather = await this.fetchWeatherSafe(context.destination);
      if (weather) {
        weatherBlock = buildWeatherContext(weather);
        context.lastWeather = {
          temperature: weather.temperature,
          condition: weather.condition,
          cityName: weather.cityName,
        };
      }
    }

    // 3. Build the system prompt with injected real-time context
    let systemPrompt = PERSONAL_ASSISTANT_SYSTEM_PROMPT;
    if (weatherBlock) {
      systemPrompt += weatherBlock;
    }
    if (context.destination) {
      systemPrompt += `\n\n[CONTEXT: The user is interested in ${context.destination}.]`;
    }

    // 4. Send to Gemini — the model handles the conversation naturally
    const result = await this.geminiService.chat({
      agentKey: 'personal',
      systemPrompt,
      conversationHistory,
      userMessage,
      maxTokens: 2048,
      temperature: 0.7,
    });

    return {
      text: result.text,
      context,
      tokenCount: result.tokenCount,
    };
  }

  /**
   * Get the initial greeting for a new session.
   */
  getGreeting(): string {
    return `Hey! 🧳 I'm your TripVerse Travel Assistant. Ask me anything about travel — packing tips, cultural advice, weather info, visa requirements, you name it. Where are you headed?`;
  }

  /**
   * Extract destination from user message using lightweight Gemini call.
   */
  private async extractDestination(message: string): Promise<string | null> {
    try {
      const result = await this.geminiService.extractJson(
        'personal',
        DESTINATION_EXTRACTION_PROMPT,
        message,
      );
      return result?.destination || null;
    } catch {
      return null;
    }
  }

  private extractDestinationLocal(message: string): string | null {
    const text = (message || '').trim();
    if (!text) return null;

    // Common patterns: "going to Paris", "trip to Tokyo", "in Dubai", "visit Istanbul"
    const m =
      text.match(/\b(?:to|in|visit|visiting|going to|travel to|trip to)\s+([A-Za-z][A-Za-z\s.'-]{1,60})\b/i);
    if (!m) return null;

    const candidate = m[1].trim();
    // avoid absurdly short/long captures
    if (candidate.length < 2 || candidate.length > 60) return null;
    return candidate;
  }

  /**
   * Fetch weather safely — never throws, returns null on failure.
   */
  private async fetchWeatherSafe(destination: string): Promise<WeatherContext | null> {
    try {
      const [current, forecastData] = await Promise.all([
        this.weatherService.getCurrentWeather(destination),
        this.weatherService.getForecast(destination, 7),
      ]);

      return {
        temperature: current.temperature,
        condition: current.condition,
        humidity: current.humidity,
        windSpeed: current.windSpeed,
        cityName: current.cityName,
        forecast: forecastData.forecast?.slice(0, 5).map((d: any) => ({
          date: d.date,
          condition: d.condition,
          temperatureMax: d.temperatureMax,
          temperatureMin: d.temperatureMin,
        })),
      };
    } catch (err: any) {
      this.logger.warn(`Weather fetch failed for "${destination}": ${err.message}`);
      return null;
    }
  }
}
