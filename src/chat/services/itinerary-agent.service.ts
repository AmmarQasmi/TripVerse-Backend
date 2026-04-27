import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  previewPhase?: 'compact' | 'full';
  tokenCount?: number;
}

@Injectable()
export class ItineraryAgentService {
  private readonly logger = new Logger(ItineraryAgentService.name);
  private readonly DEFAULT_FREE_TRIAL_MAX_DAYS = 7;

  constructor(
    private configService: ConfigService,
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
    const freeTrialMaxDays =
      Number(this.configService.get<string>('FREE_TRIAL_MAX_DAYS')) ||
      this.DEFAULT_FREE_TRIAL_MAX_DAYS;

    // 1. Try to detect destination from user message (if not already known)
    const context = { ...sessionContext };

    // Greeting-only messages are common and shouldn't require heavy generations.
    // We still prefer a real model response, but keep it lightweight.
    const greetingOnly = this.isGreetingOnly(userMessage) && !context.destination;

    if (!context.destination) {
      const extracted = this.extractDestinationLocal(userMessage) || await this.extractDestination(userMessage);
      if (extracted) {
        context.destination = extracted;
        this.logger.log(`Destination detected: ${extracted}`);
      }
    }

    // 1b. Detect requested duration (days) so we can enforce free-trial limits
    const days = this.extractRequestedDays(userMessage);
    if (days) {
      context.requestedDays = days;
    }

    // If user explicitly asks for more than free-trial days, do NOT call Gemini.
    // But if they later say "7 days" (or another allowed number), accept that as the corrected request.
    if (context.requestedDays && context.requestedDays > freeTrialMaxDays) {
      return {
        text:
          `I can absolutely help — on the free trial I can generate up to **${freeTrialMaxDays} days** in one itinerary.\n\n` +
          `Your request is for **${context.requestedDays} days**. If you want, I can:\n` +
          `- create a **${freeTrialMaxDays}-day** itinerary now, or\n` +
          `- help you **split** it into two parts (e.g., days 1-${freeTrialMaxDays} first).\n\n` +
          `Tell me which option you prefer.`,
        context,
      };
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
    if (context.requestedDays && context.requestedDays > 0) {
      systemPrompt += `\n\n[CONTEXT: The user requested ${context.requestedDays} days. If you generate a preview JSON, it MUST include exactly ${context.requestedDays} days.]`;
    }

    // 4. Send to Gemini
    let result;
    try {
      result = await this.geminiService.chat({
        agentKey: 'itinerary',
        systemPrompt: greetingOnly
          ? systemPrompt + `\n\n[USER MESSAGE IS A GREETING: respond warmly and ask ONE short follow-up question to start planning (destination + days). Do NOT generate preview JSON yet.]`
          : systemPrompt + this.compactPreviewOverride(context.requestedDays),
        conversationHistory,
        userMessage,
        maxTokens: greetingOnly ? 256 : this.computeMaxTokens(context.requestedDays),
        temperature: 0.7,
      });
    } catch (e) {
      // If Gemini is down, fall back to a minimal prompt so the chat still progresses.
      if (greetingOnly) {
        return {
          text: `Where are you traveling to, and for how many days? (Example: “Rome, 5 days”)`,
          context,
        };
      }
      throw e;
    }

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
      previewPhase: previewData ? 'compact' : undefined,
      tokenCount: result.tokenCount,
    };
  }

  async expandToFullPreview(
    userMessage: string,
    conversationHistory: Content[],
    sessionContext: Record<string, any>,
  ): Promise<AgentResponse> {
    const context = { ...sessionContext };

    // Rebuild prompt with context (same as processMessage)
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

    let systemPrompt = ITINERARY_SYSTEM_PROMPT;
    if (weatherBlock) systemPrompt += weatherBlock;
    if (context.destination) {
      systemPrompt += `\n\n[CONTEXT: The user is interested in traveling to ${context.destination}.]`;
    }
    if (context.requestedDays && context.requestedDays > 0) {
      systemPrompt += `\n\n[CONTEXT: The user requested ${context.requestedDays} days. If you generate a preview JSON, it MUST include exactly ${context.requestedDays} days.]`;
    }

    // Full preview generation instruction (no extra questions)
    systemPrompt += `\n\n[IMPORTANT: You already asked clarifying questions earlier. Now generate the full itinerary_preview JSON immediately (with places + hotel_recommendations as specified). Do not ask additional questions in this step.]`;

    const result = await this.geminiService.chat({
      agentKey: 'itinerary',
      systemPrompt,
      conversationHistory,
      userMessage,
      maxTokens: this.computeMaxTokens(context.requestedDays),
      temperature: 0.7,
    });

    const previewData = this.extractPreview(result.text);
    if (previewData) {
      context.hasPreview = true;
      context.destination = previewData.destination || context.destination;
    }

    return {
      text: result.text,
      context,
      previewData: previewData || undefined,
      previewPhase: previewData ? 'full' : undefined,
      tokenCount: result.tokenCount,
    };
  }

  /**
   * Get the initial greeting for a new session.
   */
  getGreeting(): string {
    const freeTrialMaxDays =
      Number(this.configService.get<string>('FREE_TRIAL_MAX_DAYS')) ||
      this.DEFAULT_FREE_TRIAL_MAX_DAYS;

    return (
      `Hi there! I'm your TripVerse Itinerary Planner.\n\n` +
      `Tell me about your trip — where are you headed and what kind of experience you want — and I’ll put together a plan.\n\n` +
      `**Free plan note:** I can generate up to **${freeTrialMaxDays} days** per itinerary on a free account. If you need more, we can split it into parts.`
    );
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

  private extractDestinationLocal(message: string): string | null {
    const text = (message || '').trim();
    if (!text) return null;

    // Common patterns: "going to Paris", "trip to Tokyo", "in Dubai", "visit Istanbul"
    const m =
      text.match(/\b(?:to|in|visit|visiting|going to|travel to|trip to)\s+([A-Za-z][A-Za-z\s.'-]{1,60})\b/i);
    if (!m) return null;

    const candidate = m[1].trim();
    if (candidate.length < 2 || candidate.length > 60) return null;
    return candidate;
  }

  private extractRequestedDays(message: string): number | null {
    const text = (message || '').toLowerCase();
    // Common patterns: "4 days", "7-day", "for 10 day trip", "3 nights" (approx)
    const m =
      text.match(/(?:for\s*)?(\d{1,2})\s*[- ]?\s*(day|days|night|nights)\b/) ||
      text.match(/\b(\d{1,2})\s*[- ]?\s*day\b/);
    if (!m) return null;

    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(n, 60); // sanity cap
  }

  private isGreetingOnly(message: string): boolean {
    const t = (message || '').trim().toLowerCase();
    if (!t) return true;
    return /^(hi|hey|hello|heyy+|hiya|yo|sup|assalamualaikum|asalamualaikum|aoa)[!?\.]*$/.test(t);
  }

  private computeMaxTokens(requestedDays?: number): number {
    // Token budget heuristic for preview JSON:
    // base + per-day, capped to keep latency + overload risk reasonable.
    const days = Number(requestedDays) > 0 ? Number(requestedDays) : 4;
    const estimated = 1400 + days * 420;
    return Math.max(2048, Math.min(estimated, 4096));
  }

  private compactPreviewOverride(requestedDays?: number): string {
    const days = Number(requestedDays) > 0 ? Number(requestedDays) : undefined;
    return (
      `\n\n[MODE: COMPACT_PREVIEW_FIRST]\n` +
      `If you decide to generate a preview JSON in this response, keep it LIGHTWEIGHT so it renders fast on mobile data:\n` +
      `- Still use type "itinerary_preview"\n` +
      `- Include title, destination, duration_days, travel_style, budget_estimate, total_estimated_cost\n` +
      `- For each day, include ONLY: day number + a short title/theme (no places array, no hotel_recommendations)\n` +
      `- Keep the JSON small and avoid long descriptions\n` +
      (days ? `- The days array must include exactly ${days} days\n` : ``)
    );
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
