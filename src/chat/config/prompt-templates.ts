// =============================================
// Prompt Templates for AI Agents
// =============================================
// Focused, modular prompts — each for a specific task.
// Avoid large monolithic prompts. Keep each under 500 tokens.

// =============================================
// ITINERARY GENERATOR PROMPTS
// =============================================

export const ITINERARY_SYSTEM_PROMPT = `You are TripVerse Itinerary Planner, a friendly and knowledgeable travel planning assistant.
You specialize in creating 4-day leisure travel itineraries.
You are conversational, warm, and to-the-point.
Always respond naturally — do NOT respond with JSON unless specifically asked.
Keep responses detailed yet meaningful during the slot-filling conversation.
Use emojis sparingly to keep things friendly.`;

export function buildItineraryGenerationPrompt(slots: {
  destination: string;
  travelStyle: string;
  budget: string;
  interests: string[];
  dates?: string;
}): string {
  return `Generate a detailed 4-day leisure travel itinerary with the following preferences:

**Destination:** ${slots.destination}
**Travel Style:** ${slots.travelStyle}
**Budget:** ${slots.budget}
**Interests:** ${slots.interests.join(', ')}
${slots.dates && slots.dates !== 'skipped' ? `**Dates:** ${slots.dates}` : '**Dates:** Flexible'}

Return the itinerary in this EXACT JSON format (no markdown, no extra text — ONLY the JSON):
{
  "title": "4 Days in [Destination]",
  "summary": "Brief 2-sentence overview of the trip",
  "destination": "${slots.destination}",
  "days": [
    {
      "day": 1,
      "theme": "Arrival & [Theme]",
      "morning": {
        "activity": "Activity name",
        "description": "1-2 sentences about the activity",
        "tip": "Practical tip"
      },
      "afternoon": {
        "activity": "Activity name",
        "description": "1-2 sentences",
        "tip": "Practical tip"
      },
      "evening": {
        "activity": "Activity name",
        "description": "1-2 sentences",
        "tip": "Practical tip"
      },
      "food_suggestion": {
        "restaurant_or_type": "Name or type of cuisine",
        "description": "Why this is a good choice",
        "budget_estimate": "$ range"
      },
      "pacing_tip": "One tip about pacing for this day"
    }
  ],
  "general_tips": ["Tip 1", "Tip 2", "Tip 3"],
  "estimated_daily_budget": "$ range per day"
}

Generate exactly 4 days. Make activities specific to ${slots.destination} and aligned with the ${slots.travelStyle} style. Keep food suggestions within ${slots.budget} budget. Focus on: ${slots.interests.join(', ')}.`;
}

export const ITINERARY_FOLLOWUP_PROMPT = `You are TripVerse Itinerary Planner continuing a conversation.
The user has received their 4-day itinerary and may ask follow-up questions about it.
Answer questions about the itinerary, suggest modifications, or provide more details.
Keep responses helpful and detailed.
If they ask to regenerate, suggest they start a new session.`;

// =============================================
// PERSONAL TRAVEL ASSISTANT PROMPTS
// =============================================

export const PERSONAL_ASSISTANT_SYSTEM_PROMPT = `You are TripVerse Personal Travel Assistant, a helpful and experienced travel advisor.
You provide contextual travel advice based on the user's destination and purpose.
You are conversational, warm, and practical.
Always respond naturally — do NOT respond with JSON unless specifically asked.
Keep responses detailed yet meaningful during slot-filling.
Use emojis sparingly.`;

export function buildAdvisoryPrompt(slots: {
  destination: string;
  purpose: string;
  duration?: string;
  concerns?: string[];
}): string {
  const purposeContext = getPurposeContext(slots.purpose);

  return `Provide comprehensive travel advice for the following:

**Destination:** ${slots.destination}
**Purpose:** ${slots.purpose}
${slots.duration && slots.duration !== 'skipped' ? `**Duration:** ${slots.duration}` : ''}
${slots.concerns && slots.concerns.length > 0 ? `**Specific Concerns:** ${slots.concerns.join(', ')}` : ''}

${purposeContext}

Return the advice in this EXACT JSON format (no markdown, no extra text — ONLY the JSON):
{
  "title": "${slots.purpose} Guide for ${slots.destination}",
  "destination": "${slots.destination}",
  "purpose": "${slots.purpose}",
  "sections": [
    {
      "heading": "Section Title",
      "icon": "emoji",
      "items": [
        {
          "title": "Item title",
          "detail": "Practical advice (2-3 sentences)"
        }
      ]
    }
  ],
  "quick_tips": ["Tip 1", "Tip 2", "Tip 3", "Tip 4", "Tip 5"],
  "important_warning": "One critical thing to be aware of (or null)"
}

Generate 4-6 relevant sections based on the purpose and concerns. Be specific to ${slots.destination}.`;
}

function getPurposeContext(purpose: string): string {
  const lower = purpose.toLowerCase();

  if (lower.includes('travel') || lower.includes('tourism')) {
    return `Focus on: packing advice, culture tips, local customs, budgeting tips, weather preparation, safety, transportation, and must-know local phrases.`;
  }
  if (lower.includes('education') || lower.includes('study')) {
    return `Focus on: student essentials, required documents & visa, university accommodation tips, cost of living, student discounts, local student communities, academic culture, and health insurance.`;
  }
  if (lower.includes('work') || lower.includes('business')) {
    return `Focus on: professional etiquette, business culture, dress code, logistics, work visa requirements, co-working spaces, networking tips, and corporate gifting customs.`;
  }

  return `Focus on: general travel preparation, local customs, safety, transportation, and practical tips.`;
}

export const PERSONAL_FOLLOWUP_PROMPT = `You are TripVerse Personal Travel Assistant continuing a conversation.
The user has received their travel advice and may ask follow-up questions.
Answer questions with specific, practical advice related to their destination and purpose.
Keep responses helpful and concise (under 200 words).`;

// =============================================
// WEATHER CONTEXT BUILDER
// =============================================

export interface WeatherContext {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  cityName: string;
  forecast?: Array<{
    date: string;
    condition: string;
    temperatureMax: number;
    temperatureMin: number;
  }>;
}

export function buildWeatherContextBlock(weather: WeatherContext): string {
  let block = `\n\n**🌤️ Real-Time Weather for ${weather.cityName}:**\n`;
  block += `- Current: ${weather.temperature}°C, ${weather.condition}, Humidity ${weather.humidity}%, Wind ${weather.windSpeed} km/h\n`;

  if (weather.forecast && weather.forecast.length > 0) {
    block += `- Forecast (next ${weather.forecast.length} days):\n`;
    weather.forecast.forEach((day) => {
      block += `  • ${day.date}: ${day.condition}, ${day.temperatureMin}°C – ${day.temperatureMax}°C\n`;
    });
  }

  block += `\n**Based on this weather data, you MUST include:**\n`;
  block += `- A "Weather & Clothing" section with specific packing recommendations\n`;
  block += `- Clothing layers advice (e.g. light/warm, rain gear, sun protection)\n`;
  block += `- Weather-aware activity adjustments (e.g. indoor alternatives if rainy)\n`;
  block += `- Any weather-related health tips (hydration, sunscreen, cold protection)\n`;

  return block;
}
