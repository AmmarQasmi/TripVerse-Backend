import { Injectable, Logger } from '@nestjs/common';
import { Content } from '@google/generative-ai';
import { GeminiService } from './gemini.service';
import { WeatherService } from '../../weather/weather.service';
import {
  ITINERARY_SYSTEM_PROMPT,
  DESTINATION_EXTRACTION_PROMPT,
  buildWeatherContext,
  WeatherContext,
} from '../config/prompt-templates';

export interface AgentResponse {
  text: string;
  context: Record<string, any>;
  previewData?: any;
  tokenCount?: number;
}

@Injectable()
export class ItineraryAgentService {
  private readonly logger = new Logger(ItineraryAgentService.name);

  constructor(
    private geminiService: GeminiService,
    private weatherService: WeatherService,
  ) {}

  /**
   * Process a user message — pure conversational flow.
   * No state machine, no slot-filling. Gemini drives the conversation.
   */
  async processMessage(
    userMessage: string,
    conversationHistory: Content[],
    sessionContext: Record<string, any>,
  ): Promise<AgentResponse> {
    // 1. Try to detect destination from user message (if not already known)
    const context = { ...sessionContext };
    if (!context.destination) {
      const extracted = await this.extractDestination(userMessage);
      if (extracted) {
        context.destination = extracted;
        this.logger.log(`Destination detected: ${extracted}`);
      }
    }

    // 2. Fetch weather if we have a destination and haven't fetched recently
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

    // 3. Build the system prompt with injected context
    let systemPrompt = ITINERARY_SYSTEM_PROMPT;
    if (weatherBlock) {
      systemPrompt += weatherBlock;
    }
    if (context.destination) {
      systemPrompt += `\n\n[CONTEXT: The user is interested in traveling to ${context.destination}.]`;
    }

    // 4. Send to Gemini — the model drives the conversation naturally
    const result = await this.geminiService.chat({
      agentKey: 'itinerary',
      systemPrompt,
      conversationHistory,
      userMessage,
      maxTokens: 8192,
      temperature: 0.7,
    });

    // 5. Check if the response contains an itinerary preview
    const previewData = this.extractPreview(result.text);
    if (previewData) {
      context.hasPreview = true;
      context.destination = previewData.destination || context.destination;
    }

    return {
      text: result.text,
      context,
      previewData: previewData || undefined,
      tokenCount: result.tokenCount,
    };
  }

  /**
   * Get the initial greeting for a new session.
   */
  getGreeting(): string {
    return `Hi there! 🌍 I'm your TripVerse Itinerary Planner. Tell me about your trip — where are you headed, what kind of experience you're looking for, and I'll put together a plan for you. You can also ask me about packing, weather, or anything travel-related!`;
  }

  /**
   * Extract destination from user message using lightweight Gemini call.
   */
  private async extractDestination(message: string): Promise<string | null> {
    try {
      const result = await this.geminiService.extractJson(
        'itinerary',
        DESTINATION_EXTRACTION_PROMPT,
        message,
      );
      return result?.destination || null;
    } catch {
      return null;
    }
  }

  /**
   * Extract itinerary preview JSON from bot response.
   * The system prompt instructs the model to return previews in ```json blocks.
   */
  private extractPreview(responseText: string): any {
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (!jsonMatch) return null;

    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (parsed?.type === 'itinerary_preview' && parsed?.days) {
        return parsed;
      }
    } catch {}

    return null;
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
