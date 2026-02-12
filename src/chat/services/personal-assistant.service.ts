import { Injectable, Logger } from '@nestjs/common';
import { AiAgentType } from '@prisma/client';
import { Content } from '@google/generative-ai';
import { GeminiService } from './gemini.service';
import { StateMachineService } from './state-machine.service';
import { WeatherService } from '../../weather/weather.service';
import {
  PERSONAL_ASSISTANT_SYSTEM_PROMPT,
  PERSONAL_FOLLOWUP_PROMPT,
  buildAdvisoryPrompt,
  buildWeatherContextBlock,
  WeatherContext,
} from '../config/prompt-templates';

interface AgentResponse {
  text: string;
  nextState: string;
  updatedSlots: Record<string, any>;
  advisoryData?: any;     // Populated when advisory is generated
  tokenCount?: number;
}

@Injectable()
export class PersonalAssistantService {
  private readonly logger = new Logger(PersonalAssistantService.name);

  constructor(
    private geminiService: GeminiService,
    private stateMachineService: StateMachineService,
    private weatherService: WeatherService,
  ) {}

  /**
   * Process a user message through the personal assistant flow.
   */
  async processMessage(
    currentState: string,
    currentSlots: Record<string, any>,
    userMessage: string,
    conversationHistory: Content[],
  ): Promise<AgentResponse> {
    const agentType = AiAgentType.PERSONAL_ASSISTANT;

    // Handle the initial state
    if (currentState === 'init') {
      const greeting = this.stateMachineService.getGreeting(agentType);
      return {
        text: greeting,
        nextState: 'ask_destination',
        updatedSlots: currentSlots,
      };
    }

    // Handle follow-up conversation after advice is generated
    if (currentState === 'followup') {
      return this.handleFollowUp(userMessage, currentSlots, conversationHistory);
    }

    // Handle retry when generation previously failed
    if (currentState === 'generate_advice') {
      return this.generateAdvisory(currentSlots, conversationHistory, userMessage);
    }

    // Run state machine
    const smResult = await this.stateMachineService.processMessage(
      agentType,
      currentState,
      currentSlots,
      userMessage,
    );

    // If complete — generate advisory
    if (smResult.isComplete && smResult.nextState === 'generate_advice') {
      return this.generateAdvisory(smResult.updatedSlots, conversationHistory, userMessage);
    }

    // If we have a response from the state machine, return it
    if (smResult.responseText) {
      return {
        text: smResult.responseText,
        nextState: smResult.nextState,
        updatedSlots: smResult.updatedSlots,
      };
    }

    // Fallback conversational
    return this.handleConversational(
      currentState,
      smResult.updatedSlots,
      userMessage,
      conversationHistory,
    );
  }

  /**
   * Generate comprehensive travel advisory using all collected slots.
   */
  private async generateAdvisory(
    slots: Record<string, any>,
    conversationHistory: Content[],
    userRequest?: string,
  ): Promise<AgentResponse> {
    this.logger.log(`Generating advisory for: ${slots.destination} (${slots.purpose})`);

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

    // Build advisory prompt from slots + optional user emphasis
    let advisoryPrompt = buildAdvisoryPrompt({
      destination: slots.destination,
      purpose: slots.purpose || 'Travel',
      duration: slots.duration,
      concerns: Array.isArray(slots.concerns) ? slots.concerns : undefined,
    }) + weatherBlock;

    // Preserve the user's original request for nuanced emphasis
    if (userRequest && userRequest.length > 5) {
      advisoryPrompt += `\n\n**User's specific request:** "${userRequest}"\nHonor any emphasis or special instructions mentioned above.`;
    }

    try {
      const result = await this.geminiService.sendMessage({
        agentKey: 'personal',
        systemPrompt: PERSONAL_ASSISTANT_SYSTEM_PROMPT,
        conversationHistory,
        userMessage: advisoryPrompt,
        maxTokens: 4096,
        temperature: 0.7,
      });

      const advisoryData = this.parseAdvisoryJson(result.text);

      if (advisoryData) {
        const summaryText = this.buildAdvisorySummary(advisoryData);
        return {
          text: summaryText,
          nextState: 'followup',
          updatedSlots: slots,
          advisoryData,
          tokenCount: result.tokenCount,
        };
      }

      return {
        text: `Here's your personalized travel advice for **${slots.destination}**! 🎒\n\n${result.text}`,
        nextState: 'followup',
        updatedSlots: slots,
        tokenCount: result.tokenCount,
      };
    } catch (error: any) {
      this.logger.error(`Advisory generation failed: ${error.message}`);
      return {
        text: `I'm sorry, I couldn't generate your travel advice right now. Please try again. 😔`,
        nextState: 'generate_advice',
        updatedSlots: slots,
      };
    }
  }

  /**
   * Handle follow-up questions after advisory is generated.
   */
  private async handleFollowUp(
    userMessage: string,
    slots: Record<string, any>,
    conversationHistory: Content[],
  ): Promise<AgentResponse> {
    const contextPrompt = `${PERSONAL_FOLLOWUP_PROMPT}
The user is visiting ${slots.destination} for ${slots.purpose}.
Answer their follow-up question with specific, practical advice.`;

    const result = await this.geminiService.sendMessage({
      agentKey: 'personal',
      systemPrompt: contextPrompt,
      conversationHistory,
      userMessage,
      maxTokens: 1024,
      temperature: 0.7,
    });

    return {
      text: result.text,
      nextState: 'followup',
      updatedSlots: slots,
      tokenCount: result.tokenCount,
    };
  }

  private async handleConversational(
    currentState: string,
    slots: Record<string, any>,
    userMessage: string,
    conversationHistory: Content[],
  ): Promise<AgentResponse> {
    const contextPrompt = `${PERSONAL_ASSISTANT_SYSTEM_PROMPT}
Current conversation state: ${currentState}
Collected data so far: ${JSON.stringify(slots)}
Continue the conversation naturally and ask the next relevant question.`;

    const result = await this.geminiService.sendMessage({
      agentKey: 'personal',
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

  private buildAdvisorySummary(data: any): string {
    let summary = `🎒 **${data.title || 'Your Travel Advisory'}**\n\n`;

    if (data.sections && Array.isArray(data.sections)) {
      data.sections.forEach((section: any) => {
        summary += `**${section.icon || '📌'} ${section.heading}**\n`;
        if (section.items && Array.isArray(section.items)) {
          section.items.forEach((item: any) => {
            summary += `  • **${item.title}**: ${item.detail}\n`;
          });
        }
        summary += '\n';
      });
    }

    if (data.quick_tips && Array.isArray(data.quick_tips)) {
      summary += `**⚡ Quick Tips:**\n`;
      data.quick_tips.forEach((tip: string) => {
        summary += `• ${tip}\n`;
      });
      summary += '\n';
    }

    if (data.important_warning) {
      summary += `⚠️ **Important:** ${data.important_warning}\n\n`;
    }

    summary += `_Feel free to ask me anything else about your trip!_`;
    return summary;
  }

  private parseAdvisoryJson(text: string): any {
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
