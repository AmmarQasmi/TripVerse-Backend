import { Injectable, Logger } from '@nestjs/common';
import { AiAgentType } from '@prisma/client';
import { Content } from '@google/generative-ai';
import { GeminiService } from './gemini.service';
import { StateMachineService } from './state-machine.service';
import { WeatherService } from '../../weather/weather.service';
import {
  ITINERARY_SYSTEM_PROMPT,
  ITINERARY_FOLLOWUP_PROMPT,
  buildItineraryGenerationPrompt,
  buildWeatherContextBlock,
  WeatherContext,
} from '../config/prompt-templates';

interface AgentResponse {
  text: string;
  nextState: string;
  updatedSlots: Record<string, any>;
  itineraryData?: any;    // Populated when itinerary is generated
  tokenCount?: number;
}

@Injectable()
export class ItineraryAgentService {
  private readonly logger = new Logger(ItineraryAgentService.name);

  constructor(
    private geminiService: GeminiService,
    private stateMachineService: StateMachineService,
    private weatherService: WeatherService,
  ) {}

  /**
   * Process a user message through the itinerary generation flow.
   */
  async processMessage(
    currentState: string,
    currentSlots: Record<string, any>,
    userMessage: string,
    conversationHistory: Content[],
  ): Promise<AgentResponse> {
    const agentType = AiAgentType.ITINERARY_GENERATOR;

    // Handle the initial state — just return greeting
    if (currentState === 'init') {
      const greeting = this.stateMachineService.getGreeting(agentType);
      return {
        text: greeting,
        nextState: 'ask_destination',
        updatedSlots: currentSlots,
      };
    }

    // Handle follow-up conversation after itinerary is generated
    if (currentState === 'complete') {
      return this.handleFollowUp(userMessage, conversationHistory);
    }

    // Handle retry when generation previously failed
    if (currentState === 'generate_itinerary') {
      return this.generateItinerary(currentSlots, conversationHistory);
    }

    // Run state machine to extract slots and determine next state
    const smResult = await this.stateMachineService.processMessage(
      agentType,
      currentState,
      currentSlots,
      userMessage,
    );

    // If complete — generate the itinerary
    if (smResult.isComplete && smResult.nextState === 'generate_itinerary') {
      return this.generateItinerary(smResult.updatedSlots, conversationHistory, userMessage);
    }

    // If we have a response from the state machine (next question), return it
    if (smResult.responseText) {
      return {
        text: smResult.responseText,
        nextState: smResult.nextState,
        updatedSlots: smResult.updatedSlots,
      };
    }

    // Fallback: use Gemini for conversational response
    return this.handleConversational(
      currentState,
      smResult.updatedSlots,
      userMessage,
      conversationHistory,
    );
  }

  /**
   * Generate the full 4-day itinerary using all collected slots.
   */
  private async generateItinerary(
    slots: Record<string, any>,
    conversationHistory: Content[],
    userRequest?: string,
  ): Promise<AgentResponse> {
    this.logger.log(`Generating itinerary for: ${slots.destination}`);

    // Fetch real-time weather for the destination
    let weatherBlock = '';
    try {
      const weather = await this.fetchWeatherContext(slots.destination);
      if (weather) {
        weatherBlock = buildWeatherContextBlock(weather);
        this.logger.log(`Weather fetched for ${slots.destination}: ${weather.temperature}°C, ${weather.condition}`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not fetch weather for ${slots.destination}: ${err.message}`);
    }

    let generationPrompt = buildItineraryGenerationPrompt({
      destination: slots.destination,
      travelStyle: slots.travelStyle || 'Relaxed',
      budget: slots.budget || 'Mid-Range',
      interests: Array.isArray(slots.interests) ? slots.interests : ['Sightseeing'],
      dates: slots.dates,
    }) + weatherBlock;

    // Preserve the user's original request for nuanced emphasis
    if (userRequest && userRequest.length > 5) {
      generationPrompt += `\n\n**User's specific request:** "${userRequest}"\nHonor any emphasis or special instructions mentioned above.`;
    }

    try {
      const result = await this.geminiService.sendMessage({
        agentKey: 'itinerary',
        systemPrompt: ITINERARY_SYSTEM_PROMPT,
        conversationHistory,
        userMessage: generationPrompt,
        maxTokens: 4096,
        temperature: 0.8,
      });

      // Try to parse JSON itinerary from response
      const itineraryData = this.parseItineraryJson(result.text);

      if (itineraryData) {
        const summaryText = this.buildItinerarySummary(itineraryData);
        return {
          text: summaryText,
          nextState: 'complete',
          updatedSlots: slots,
          itineraryData,
          tokenCount: result.tokenCount,
        };
      }

      // If JSON parsing fails, return the raw text
      return {
        text: `Here's your personalized 4-day itinerary for **${slots.destination}**! 🎉\n\n${result.text}`,
        nextState: 'complete',
        updatedSlots: slots,
        tokenCount: result.tokenCount,
      };
    } catch (error: any) {
      this.logger.error(`Itinerary generation failed: ${error.message}`);
      return {
        text: `I'm sorry, I couldn't generate your itinerary right now. Please try again in a moment. 😔`,
        nextState: 'generate_itinerary', // Stay in generation state for retry
        updatedSlots: slots,
      };
    }
  }

  /**
   * Handle follow-up questions after itinerary is generated.
   */
  private async handleFollowUp(
    userMessage: string,
    conversationHistory: Content[],
  ): Promise<AgentResponse> {
    const result = await this.geminiService.sendMessage({
      agentKey: 'itinerary',
      systemPrompt: ITINERARY_FOLLOWUP_PROMPT,
      conversationHistory,
      userMessage,
      maxTokens: 1024,
      temperature: 0.7,
    });

    return {
      text: result.text,
      nextState: 'complete',
      updatedSlots: {},
      tokenCount: result.tokenCount,
    };
  }

  /**
   * Handle conversational responses during slot-filling when state machine
   * doesn't produce a direct response.
   */
  private async handleConversational(
    currentState: string,
    slots: Record<string, any>,
    userMessage: string,
    conversationHistory: Content[],
  ): Promise<AgentResponse> {
    const contextPrompt = `${ITINERARY_SYSTEM_PROMPT}
Current conversation state: ${currentState}
Collected data so far: ${JSON.stringify(slots)}
Continue the conversation naturally and ask the next relevant question.`;

    const result = await this.geminiService.sendMessage({
      agentKey: 'itinerary',
      systemPrompt: contextPrompt,
      conversationHistory,
      userMessage,
      maxTokens: 512,
      temperature: 0.7,
    });

    return {
      text: result.text,
      nextState: currentState,
      updatedSlots: slots,
      tokenCount: result.tokenCount,
    };
  }

  /**
   * Build a human-readable summary of the generated itinerary.
   */
  private buildItinerarySummary(data: any): string {
    let summary = `🎉 Here's your personalized itinerary: **${data.title || 'Your 4-Day Trip'}**\n\n`;

    if (data.summary) {
      summary += `${data.summary}\n\n`;
    }

    if (data.days && Array.isArray(data.days)) {
      data.days.forEach((day: any) => {
        summary += `**📅 Day ${day.day}: ${day.theme || ''}**\n`;
        if (day.morning) summary += `  🌅 Morning — ${day.morning.activity}\n`;
        if (day.afternoon) summary += `  ☀️ Afternoon — ${day.afternoon.activity}\n`;
        if (day.evening) summary += `  🌙 Evening — ${day.evening.activity}\n`;
        if (day.food_suggestion) summary += `  🍽️ Food — ${day.food_suggestion.restaurant_or_type}\n`;
        summary += '\n';
      });
    }

    if (data.general_tips && Array.isArray(data.general_tips)) {
      summary += `**💡 General Tips:**\n`;
      data.general_tips.forEach((tip: string) => {
        summary += `• ${tip}\n`;
      });
    }

    summary += `\n_Feel free to ask me to adjust anything or ask follow-up questions!_`;
    return summary;
  }

  private parseItineraryJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try { return JSON.parse(jsonMatch[1].trim()); } catch {}
      }
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try { return JSON.parse(objectMatch[0]); } catch {}
      }
      return null;
    }
  }

  /**
   * Fetch current weather + 7-day forecast for a destination.
   * Returns null on failure (non-blocking).
   */
  private async fetchWeatherContext(destination: string): Promise<WeatherContext | null> {
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
