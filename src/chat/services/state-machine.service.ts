import { Injectable, Logger } from '@nestjs/common';
import { AiAgentType } from '@prisma/client';
import { GeminiService } from './gemini.service';
import {
  AgentFlowConfig,
  StateConfig,
  ITINERARY_FLOW,
  PERSONAL_ASSISTANT_FLOW,
} from '../config/flow-config';

interface SlotExtractionResult {
  extracted: Record<string, any>;
  confidence: boolean; // whether extraction was confident
}

interface StateMachineResult {
  nextState: string;
  updatedSlots: Record<string, any>;
  responseText: string;
  isComplete: boolean; // true when all slots filled and ready for generation
}

@Injectable()
export class StateMachineService {
  private readonly logger = new Logger(StateMachineService.name);

  constructor(private geminiService: GeminiService) {}

  getFlowConfig(agentType: AiAgentType): AgentFlowConfig {
    return agentType === AiAgentType.ITINERARY_GENERATOR
      ? ITINERARY_FLOW
      : PERSONAL_ASSISTANT_FLOW;
  }

  getGreeting(agentType: AiAgentType): string {
    return this.getFlowConfig(agentType).greeting;
  }

  getCurrentStateConfig(agentType: AiAgentType, currentState: string): StateConfig | null {
    const flow = this.getFlowConfig(agentType);
    return flow.states.find((s) => s.id === currentState) || null;
  }

  /**
   * Process a user message within the current state.
   * Extracts slots, validates, transitions state, and generates the next prompt.
   */
  async processMessage(
    agentType: AiAgentType,
    currentState: string,
    currentSlots: Record<string, any>,
    userMessage: string,
  ): Promise<StateMachineResult> {
    const flow = this.getFlowConfig(agentType);
    const stateConfig = flow.states.find((s) => s.id === currentState);

    if (!stateConfig) {
      this.logger.error(`Unknown state: ${currentState} for agent: ${agentType}`);
      return {
        nextState: currentState,
        updatedSlots: currentSlots,
        responseText: "I'm sorry, something went wrong. Let me restart our conversation.",
        isComplete: false,
      };
    }

    // If current state is terminal, allow free-form follow-up
    if (stateConfig.isTerminal) {
      return {
        nextState: currentState,
        updatedSlots: currentSlots,
        responseText: '', // Will be handled by the agent service
        isComplete: true,
      };
    }

    // Extract slots from user message
    const slotsToExtract = stateConfig.slots;
    if (slotsToExtract.length > 0) {
      const extraction = await this.extractSlots(
        agentType,
        slotsToExtract,
        userMessage,
        currentSlots,
        flow,
      );

      const updatedSlots = { ...currentSlots, ...extraction.extracted };

      // Check if user wants to skip optional slots
      const isSkip = this.isSkipIntent(userMessage);
      const allRequired = slotsToExtract.every((slotName) => {
        const def = flow.slotDefinitions[slotName];
        return !def.required || updatedSlots[slotName] != null;
      });

      if (allRequired || isSkip) {
        // Move to next state
        const nextState = stateConfig.nextState || currentState;
        const nextStateConfig = flow.states.find((s) => s.id === nextState);

        // Check if next state is a generation state (no slots to fill)
        if (nextStateConfig && nextStateConfig.slots.length === 0) {
          return {
            nextState,
            updatedSlots,
            responseText: '', // Agent service will handle generation
            isComplete: true,
          };
        }

        // Build prompt for next state slots
        const nextPrompt = this.buildNextPrompt(nextState, updatedSlots, flow);
        return {
          nextState,
          updatedSlots,
          responseText: nextPrompt,
          isComplete: false,
        };
      } else {
        // Slot extraction failed — ask again with hint
        const missingSlots = slotsToExtract.filter(
          (s) => !updatedSlots[s] && flow.slotDefinitions[s].required,
        );
        const retryPrompt = this.buildRetryPrompt(missingSlots, flow);
        return {
          nextState: currentState,
          updatedSlots,
          responseText: retryPrompt,
          isComplete: false,
        };
      }
    }

    // State with no slots (generation states) — signal completion
    return {
      nextState: stateConfig.nextState || currentState,
      updatedSlots: currentSlots,
      responseText: '',
      isComplete: true,
    };
  }

  /**
   * Extract slot values from user message using Gemini.
   */
  private async extractSlots(
    agentType: AiAgentType,
    slotNames: string[],
    userMessage: string,
    currentSlots: Record<string, any>,
    flow: AgentFlowConfig,
  ): Promise<SlotExtractionResult> {
    const slotHints = slotNames.map((name) => {
      const def = flow.slotDefinitions[name];
      const optionsText = def.options ? ` Options: ${def.options.join(', ')}.` : '';
      return `- "${name}" (${def.type}${def.required ? ', required' : ', optional'}): ${def.extractionHint}${optionsText}`;
    });

    const systemPrompt = `You are a slot extraction engine. Extract the following fields from the user message.
Return ONLY valid JSON with the extracted values. If a value cannot be extracted, use null.
Do not add any explanation or text outside the JSON.

Slots to extract:
${slotHints.join('\n')}

Already collected data: ${JSON.stringify(currentSlots)}

Rules:
- For array types, return a JSON array of strings
- For string types, return a clean string value
- If user says "skip", "no", "none", or similar for optional fields, return "skipped"
- Match options closely if provided (fuzzy match is fine)`;

    try {
      const agentKey = agentType === AiAgentType.ITINERARY_GENERATOR ? 'itinerary' : 'personal';
      const result = await this.geminiService.sendMessage({
        agentKey,
        systemPrompt,
        conversationHistory: [],
        userMessage,
        temperature: 0.2, // Low temperature for extraction accuracy
        maxTokens: 512,
      });

      const parsed = this.parseJsonResponse(result.text);
      if (parsed) {
        // Clean null/undefined values and normalize types
        const extracted: Record<string, any> = {};
        for (const key of slotNames) {
          if (parsed[key] != null && parsed[key] !== 'null' && parsed[key] !== '') {
            const slotDef = flow.slotDefinitions[key];
            let value = parsed[key];

            // Normalize array-type slots
            if (slotDef.type === 'array') {
              // Handle "all" / "everything" — expand to all options
              if (
                typeof value === 'string' &&
                ['all', 'everything', 'all of them', 'all of the above'].includes(value.toLowerCase())
              ) {
                value = slotDef.options ? [...slotDef.options] : [value];
              } else if (typeof value === 'string') {
                // Single string → wrap in array
                value = [value];
              }
            }

            extracted[key] = value;
          }
        }
        return { extracted, confidence: true };
      }
    } catch (error: any) {
      this.logger.warn(`Slot extraction failed: ${error.message}`);
    }

    // Fallback: try simple keyword matching for single-slot states
    if (slotNames.length === 1) {
      const slotName = slotNames[0];
      const slotDef = flow.slotDefinitions[slotName];
      const trimmed = userMessage.trim();

      // Handle "all" / "everything" for array-type slots with options
      if (slotDef.type === 'array' && slotDef.options && slotDef.options.length > 0) {
        const lower = trimmed.toLowerCase();
        if (lower === 'all' || lower === 'everything' || lower === 'all of them' || lower === 'all of the above') {
          return {
            extracted: { [slotName]: [...slotDef.options] },
            confidence: true,
          };
        }
      }

      if (trimmed.length > 0 && trimmed.length < 200) {
        // For array slots, wrap single value in array
        const value = slotDef.type === 'array' ? [trimmed] : trimmed;
        return {
          extracted: { [slotName]: value },
          confidence: false,
        };
      }
    }

    return { extracted: {}, confidence: false };
  }

  /**
   * Build the next question prompt based on the upcoming state.
   */
  private buildNextPrompt(
    nextState: string,
    slots: Record<string, any>,
    flow: AgentFlowConfig,
  ): string {
    const stateConfig = flow.states.find((s) => s.id === nextState);
    if (!stateConfig || stateConfig.slots.length === 0) return '';

    const slotName = stateConfig.slots[0];
    const slotDef = flow.slotDefinitions[slotName];
    if (!slotDef) return '';

    let prompt = '';

    // Add varied acknowledgment of what was just collected
    const lastFilledSlot = this.getLastFilledSlot(slots, flow);
    if (lastFilledSlot) {
      const val = slots[lastFilledSlot];
      const ack = this.getRandomAcknowledgment();
      if (Array.isArray(val)) {
        prompt += `${ack} — noted **${val.join(', ')}**. `;
      } else if (val && val !== 'skipped') {
        prompt += `${ack} — **${val}**! `;
      }
    }

    prompt += `\n\n${slotDef.prompt}`;

    if (slotDef.options && slotDef.options.length > 0) {
      prompt += '\n\n' + slotDef.options.map((opt) => `• ${opt}`).join('\n');
    }

    if (!slotDef.required) {
      prompt += '\n\n_(You can type "skip" to skip this)_';
    }

    return prompt;
  }

  private getRandomAcknowledgment(): string {
    const acks = [
      'Great choice',
      'Perfect',
      'Awesome',
      'Sounds good',
      'Noted',
      'Love it',
      'Got it',
      'Nice',
      'Wonderful',
      'Excellent pick',
    ];
    return acks[Math.floor(Math.random() * acks.length)];
  }

  private buildRetryPrompt(missingSlots: string[], flow: AgentFlowConfig): string {
    const slotName = missingSlots[0];
    const slotDef = flow.slotDefinitions[slotName];
    if (!slotDef) return "I didn't quite catch that. Could you try again?";

    let prompt = `I didn't quite catch that. ${slotDef.prompt}`;
    if (slotDef.options) {
      prompt += '\n\n' + slotDef.options.map((opt) => `• ${opt}`).join('\n');
    }
    return prompt;
  }

  private getLastFilledSlot(
    slots: Record<string, any>,
    flow: AgentFlowConfig,
  ): string | null {
    const filledSlots = Object.keys(slots).filter((k) => slots[k] != null);
    return filledSlots.length > 0 ? filledSlots[filledSlots.length - 1] : null;
  }

  private isSkipIntent(message: string): boolean {
    const lower = message.toLowerCase().trim();
    return ['skip', 'no', 'none', 'nah', 'pass', "don't know", 'not sure', 'no preference'].includes(lower);
  }

  private parseJsonResponse(text: string): Record<string, any> | null {
    try {
      // Try direct parse
      return JSON.parse(text);
    } catch {
      // Try extracting JSON from markdown code block
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch {
          return null;
        }
      }

      // Try finding JSON object in text
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          return null;
        }
      }

      return null;
    }
  }
}
