import { Injectable, Logger } from '@nestjs/common';
import { PlacesService, PlaceResult, NearbyPlace as PlaceNearby } from './places.service';
import { WikipediaService, PlaceSummary } from './wikipedia.service';
import { WeatherService } from '../../weather/weather.service';

// =============================================
// Enriched Data Interfaces — returned to frontend
// =============================================

export interface EnrichedPlace {
  name: string;
  timeSlot: string;
  estimatedCost: string;
  /** Estimated travel time from previous place */
  travelTime?: string;
  /** Google Places data (photos are proxied — no API key exposed) */
  place?: {
    placeId: string;
    address: string;
    rating?: number;
    totalRatings?: number;
    coordinates?: { lat: number; lng: number };
    website?: string;
    phone?: string;
    openingHours?: { openNow: boolean; weekdayText: string[] };
    priceLevel?: number;
    photos: Array<{ url: string; width: number; height: number }>;
    reviews: Array<{
      author: string;
      rating: number;
      text: string;
      timeDescription: string;
    }>;
  };
  /** Wikipedia summary + image */
  wiki?: {
    title: string;
    summary: string;
    url: string;
    image?: string;
    coordinates?: { lat: number; lng: number };
  };
}

export interface EnrichedDay {
  day: number;
  title: string;
  places: EnrichedPlace[];
  hotelRecommendations?: Array<{
    name: string;
    type: string;
    priceRange: string;
  }>;
}

export interface EnrichedItinerary {
  type: 'enriched_itinerary';
  status: 'complete';
  title: string;
  destination: string;
  durationDays: number;
  budgetEstimate: string;
  travelStyle: string;
  days: EnrichedDay[];
  totalEstimatedCost: string;
  nearbySuggestions?: PlaceNearby[];
  weather?: {
    temperature: number;
    description: string;
    humidity: number;
    windSpeed: number;
    forecast: Array<{
      date: string;
      description: string;
      temperature: { max: number; min: number };
    }>;
  };
}

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    private places: PlacesService,
    private wikipedia: WikipediaService,
    private weatherService: WeatherService,
  ) {}

  // =============================================
  // Main Enrichment Pipeline
  // =============================================

  /**
   * Enrich an entire itinerary preview with real data.
   * Pipeline: preview → enriching → complete.
   * Photo URLs are proxied through backend (API key never exposed).
   */
  async enrichItinerary(previewData: any): Promise<EnrichedItinerary> {
    const dayCount = previewData.days?.length || 0;
    this.logger.log(`Enriching itinerary: ${previewData.title} (${dayCount} days)`);

    const destination = previewData.destination || '';

    // Enrich all days — places within each day run in parallel batches
    const enrichedDays: EnrichedDay[] = [];
    for (const day of previewData.days || []) {
      const enrichedPlaces = await this.enrichPlacesBatch(day.places || [], destination);
      // Preserve hotel recommendations from AI preview
      const hotelRecs = day.hotel_recommendations?.map((h: any) => ({
        name: h.name,
        type: h.type,
        priceRange: h.price_range,
      }));
      enrichedDays.push({
        day: day.day,
        title: day.title,
        places: enrichedPlaces,
        hotelRecommendations: hotelRecs?.length > 0 ? hotelRecs : undefined,
      });
    }

    // Get nearby suggestions (restaurants, cafes, markets)
    let nearbySuggestions: PlaceNearby[] = [];
    try {
      nearbySuggestions = await this.fetchNearbySuggestions(destination);
    } catch {
      this.logger.warn('Failed to fetch nearby suggestions');
    }

    // Fetch weather data for the destination
    let weatherData: EnrichedItinerary['weather'] = undefined;
    try {
      const [current, forecast] = await Promise.all([
        this.weatherService.getCurrentWeather(destination),
        this.weatherService.getForecast(destination, previewData.duration_days || 7),
      ]);
      weatherData = {
        temperature: current.temperature,
        description: current.condition,
        humidity: current.humidity,
        windSpeed: current.windSpeed,
        forecast: forecast.forecast.map((f: any) => ({
          date: f.date,
          description: f.condition,
          temperature: { max: f.temperatureMax, min: f.temperatureMin },
        })),
      };
    } catch {
      this.logger.warn('Failed to fetch weather data — skipping');
    }

    return {
      type: 'enriched_itinerary',
      status: 'complete',
      title: previewData.title,
      destination,
      durationDays: previewData.duration_days,
      budgetEstimate: previewData.budget_estimate,
      travelStyle: previewData.travel_style,
      days: enrichedDays,
      totalEstimatedCost: previewData.total_estimated_cost,
      nearbySuggestions: nearbySuggestions.length > 0 ? nearbySuggestions : undefined,
      weather: weatherData,
    };
  }

  /**
   * Enrich a single place on demand (used for on-demand lookups from frontend).
   */
  async enrichPlace(placeName: string, destination?: string): Promise<EnrichedPlace> {
    const query = destination ? `${placeName}, ${destination}` : placeName;

    const [placeResult, wikiResult] = await Promise.allSettled([
      this.places.searchPlace(query),
      this.wikipedia.getSummaryWithFallback(placeName, destination),
    ]);

    const place = placeResult.status === 'fulfilled' ? placeResult.value : null;
    const wiki = wikiResult.status === 'fulfilled' ? wikiResult.value : null;

    return this.buildEnrichedPlace({ name: placeName, time_slot: '', estimated_cost: '' }, place, wiki);
  }

  /**
   * Get nearby places for a destination.
   * Types: 'restaurant', 'cafe', 'tourist_attraction', 'shopping_mall', etc.
   */
  async getNearbyPlaces(
    destination: string,
    types: string[],
    limit: number = 8,
  ): Promise<PlaceNearby[]> {
    // Resolve destination to coordinates
    const destPlace = await this.places.searchPlace(destination);
    if (!destPlace?.coordinates) return [];

    const { lat, lng } = destPlace.coordinates;
    const results: PlaceNearby[] = [];
    const perType = Math.ceil(limit / types.length);

    for (const type of types) {
      try {
        const nearby = await this.places.getNearbyPlaces(lat, lng, type);
        results.push(...nearby.slice(0, perType));
      } catch {
        this.logger.warn(`Nearby search failed: type=${type}`);
      }
    }

    return results.slice(0, limit);
  }

  // =============================================
  // Internal Helpers
  // =============================================

  /**
   * Enrich a batch of places in parallel (max 3 concurrent to respect rate limits).
   */
  private async enrichPlacesBatch(
    places: any[],
    destination: string,
  ): Promise<EnrichedPlace[]> {
    const BATCH_SIZE = 3;
    const enriched: EnrichedPlace[] = [];

    for (let i = 0; i < places.length; i += BATCH_SIZE) {
      const batch = places.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((place) => this.enrichSinglePlace(place, destination)),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        enriched.push(
          result.status === 'fulfilled'
            ? result.value
            : {
                name: batch[j]?.name || 'Unknown',
                timeSlot: batch[j]?.time_slot || '',
                estimatedCost: batch[j]?.estimated_cost || '',
              },
        );
      }
    }

    return enriched;
  }

  /**
   * Patterns that indicate a generic/non-place entry (meals, transport, etc.)
   * These should NOT get Wikipedia or Google Places lookups.
   * Uses word-boundary-aware matching to avoid false positives
   * (e.g., 'rest' matching 'forest' or 'restaurant').
   */
  private static readonly SKIP_PATTERNS: RegExp[] = [
    // Meals & food stops (but not "Seafood Market" or "Food Street")
    /\bbreakfast\b/i,
    /\blunch\b/i,
    /\bdinner\b/i,
    /\bsnack\b/i,
    /\bcafeteria\b/i,
    /\bwater\s*stop\b/i,
    /\bbudget\s+(breakfast|lunch|dinner|meal|food)\b/i,
    // Transport entries
    /\btravel\s+(to|back|from)\b/i,
    /\bdeparture\s+preparation\b/i,
    /\b(bus|train|metro)\s+ride\b/i,
    /\btransfer\s+to\b/i,
    // Hotel logistics
    /\bcheck[\s-]?(in|out)\b/i,
    // Rest/downtime (but not "forest", "restaurant", "interest")
    /\bfree\s+time\b/i,
    /\brest\s+(day|stop|break)\b/i,
  ];

  /**
   * Check if a place name is a generic entry that shouldn't be enriched.
   * Uses word-boundary regex patterns to avoid false positives.
   */
  private isGenericEntry(placeName: string): boolean {
    return EnrichmentService.SKIP_PATTERNS.some(pattern => pattern.test(placeName));
  }

  /**
   * Enrich a single place with Google Places + Wikipedia.
   * Skips enrichment for generic entries (food stops, transport, etc.)
   */
  private async enrichSinglePlace(
    place: any,
    destination: string,
  ): Promise<EnrichedPlace> {
    // Skip Wikipedia/Places for generic entries like "Budget Lunch" or "Travel to Abu Dhabi"
    if (this.isGenericEntry(place.name)) {
      this.logger.log(`Skipping enrichment for generic entry: ${place.name}`);
      return this.buildEnrichedPlace(place, null, null);
    }

    const query = `${place.name}, ${destination}`;

    const [placeResult, wikiResult] = await Promise.allSettled([
      this.places.searchPlace(query),
      this.wikipedia.getSummaryWithFallback(place.name, destination),
    ]);

    const placeData = placeResult.status === 'fulfilled' ? placeResult.value : null;
    const wikiData = wikiResult.status === 'fulfilled' ? wikiResult.value : null;

    return this.buildEnrichedPlace(place, placeData, wikiData);
  }

  /**
   * Build an EnrichedPlace from raw API results.
   */
  private buildEnrichedPlace(
    raw: any,
    placeData: PlaceResult | null,
    wikiData: PlaceSummary | null,
  ): EnrichedPlace {
    const enriched: EnrichedPlace = {
      name: raw.name,
      timeSlot: raw.time_slot || '',
      estimatedCost: raw.estimated_cost || '',
      travelTime: raw.travel_time || undefined,
    };

    if (placeData) {
      enriched.place = {
        placeId: placeData.placeId,
        address: placeData.address,
        rating: placeData.rating,
        totalRatings: placeData.totalRatings,
        coordinates: placeData.coordinates,
        website: placeData.website,
        phone: placeData.phone,
        openingHours: placeData.openingHours,
        priceLevel: placeData.priceLevel,
        photos: placeData.photos,
        reviews: placeData.reviews,
      };
    }

    if (wikiData) {
      enriched.wiki = {
        title: wikiData.title,
        summary: wikiData.summary,
        url: wikiData.url,
        image: wikiData.image,
        coordinates: wikiData.coordinates,
      };
    }

    // Fallback: if Places didn't return coordinates, use Wikipedia coordinates
    if (!enriched.place?.coordinates && wikiData?.coordinates) {
      if (!enriched.place) {
        enriched.place = {
          placeId: '',
          address: '',
          photos: [],
          reviews: [],
          coordinates: wikiData.coordinates,
        };
      } else {
        enriched.place.coordinates = wikiData.coordinates;
      }
    }

    return enriched;
  }

  /**
   * Fetch nearby restaurants, cafes, and markets for a destination.
   */
  private async fetchNearbySuggestions(destination: string): Promise<PlaceNearby[]> {
    return this.getNearbyPlaces(destination, ['restaurant', 'cafe', 'shopping_mall'], 6);
  }
}
