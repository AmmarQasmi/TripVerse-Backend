// =============================================
// State Machine Configuration for AI Agents
// =============================================
// Each agent defines:
//   - states: ordered conversation states
//   - slots: data to collect at each state
//   - transitions: which state follows which

export interface SlotDefinition {
  name: string;
  type: 'string' | 'number' | 'array' | 'date';
  required: boolean;
  prompt: string;           // Question to ask the user
  validation?: RegExp;      // Optional validation pattern
  options?: string[];       // Suggested options for the user
  extractionHint: string;   // Hint for Gemini to extract slot value
}

export interface StateConfig {
  id: string;
  slots: string[];          // Which slots to fill in this state
  nextState: string | null; // Null = terminal state
  isTerminal: boolean;
  skipCondition?: (slots: Record<string, any>) => boolean;
}

export interface AgentFlowConfig {
  agentType: string;
  greeting: string;
  states: StateConfig[];
  slotDefinitions: Record<string, SlotDefinition>;
}

// =============================================
// Itinerary Generator Flow
// =============================================
export const ITINERARY_FLOW: AgentFlowConfig = {
  agentType: 'ITINERARY_GENERATOR',
  greeting: `Hello! 🌍 I'm your TripVerse Itinerary Planner. I'll help you create a personalized 4-day leisure travel itinerary.\n\nLet's start — **Where would you like to travel to?**`,

  slotDefinitions: {
    destination: {
      name: 'destination',
      type: 'string',
      required: true,
      prompt: 'Where would you like to travel to? (city or country)',
      extractionHint: 'Extract the travel destination city or country name from the user message.',
    },
    travelStyle: {
      name: 'travelStyle',
      type: 'string',
      required: true,
      prompt: 'What\'s your preferred travel style?',
      options: ['Relaxed & Easy', 'Adventure & Exploration', 'Cultural & Historical', 'Food & Nightlife', 'Nature & Outdoors'],
      extractionHint: 'Extract the travel style preference. Must be one of: relaxed, adventure, cultural, foodie, nature. Map similar terms.',
    },
    budget: {
      name: 'budget',
      type: 'string',
      required: true,
      prompt: 'What\'s your budget range for this trip?',
      options: ['Budget ($0-500)', 'Mid-Range ($500-1500)', 'Luxury ($1500+)'],
      extractionHint: 'Extract the budget level. Map to: budget, mid-range, or luxury.',
    },
    interests: {
      name: 'interests',
      type: 'array',
      required: true,
      prompt: 'What activities or interests should I focus on? (pick a few)',
      options: ['Museums', 'Local Food', 'Shopping', 'Beaches', 'Hiking', 'Photography', 'Nightlife', 'Architecture', 'Markets', 'Wildlife'],
      extractionHint: 'Extract a list of travel interests/activities the user mentioned. Return as array.',
    },
    dates: {
      name: 'dates',
      type: 'string',
      required: false,
      prompt: 'Do you have specific travel dates in mind? (optional — you can skip this)',
      extractionHint: 'Extract travel dates if mentioned. Format as "start_date to end_date" or "flexible" if no dates given.',
    },
  },

  states: [
    {
      id: 'ask_destination',
      slots: ['destination'],
      nextState: 'ask_travel_style',
      isTerminal: false,
    },
    {
      id: 'ask_travel_style',
      slots: ['travelStyle'],
      nextState: 'ask_budget',
      isTerminal: false,
    },
    {
      id: 'ask_budget',
      slots: ['budget'],
      nextState: 'ask_interests',
      isTerminal: false,
    },
    {
      id: 'ask_interests',
      slots: ['interests'],
      nextState: 'ask_dates',
      isTerminal: false,
    },
    {
      id: 'ask_dates',
      slots: ['dates'],
      nextState: 'generate_itinerary',
      isTerminal: false,
    },
    {
      id: 'generate_itinerary',
      slots: [],
      nextState: 'complete',
      isTerminal: false,
    },
    {
      id: 'complete',
      slots: [],
      nextState: null,
      isTerminal: true,
    },
  ],
};

// =============================================
// Personal Travel Assistant Flow
// =============================================
export const PERSONAL_ASSISTANT_FLOW: AgentFlowConfig = {
  agentType: 'PERSONAL_ASSISTANT',
  greeting: `Hi there! 🧳 I'm your TripVerse Personal Travel Assistant. I can help you with travel advice, packing tips, cultural insights, and more.\n\nFirst, **where are you planning to visit?**`,

  slotDefinitions: {
    destination: {
      name: 'destination',
      type: 'string',
      required: true,
      prompt: 'Where are you planning to visit?',
      extractionHint: 'Extract the travel destination city or country from the user message.',
    },
    purpose: {
      name: 'purpose',
      type: 'string',
      required: true,
      prompt: 'What\'s the purpose of your visit?',
      options: ['Travel / Tourism', 'Education / Study', 'Work / Business'],
      extractionHint: 'Extract the visit purpose. Map to: travel, education, or work.',
    },
    duration: {
      name: 'duration',
      type: 'string',
      required: false,
      prompt: 'How long will you be staying? (optional)',
      extractionHint: 'Extract the trip duration if mentioned (e.g., "2 weeks", "3 months").',
    },
    concerns: {
      name: 'concerns',
      type: 'array',
      required: false,
      prompt: 'Any specific concerns or topics you\'d like advice on? (optional)',
      options: ['Packing', 'Budget', 'Culture & Etiquette', 'Weather', 'Documents & Visa', 'Accommodation', 'Safety', 'Transportation'],
      extractionHint: 'Extract specific concerns or advice topics mentioned. Return as array.',
    },
  },

  states: [
    {
      id: 'ask_destination',
      slots: ['destination'],
      nextState: 'ask_purpose',
      isTerminal: false,
    },
    {
      id: 'ask_purpose',
      slots: ['purpose'],
      nextState: 'ask_duration',
      isTerminal: false,
    },
    {
      id: 'ask_duration',
      slots: ['duration'],
      nextState: 'ask_concerns',
      isTerminal: false,
    },
    {
      id: 'ask_concerns',
      slots: ['concerns'],
      nextState: 'generate_advice',
      isTerminal: false,
    },
    {
      id: 'generate_advice',
      slots: [],
      nextState: 'followup',
      isTerminal: false,
    },
    {
      id: 'followup',
      slots: [],
      nextState: null,
      isTerminal: true,
    },
  ],
};
