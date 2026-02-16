import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

// =============================================
// Interfaces
// =============================================

export interface PlaceSummary {
  title: string;
  /** 2-3 sentence description from Wikipedia */
  summary: string;
  url: string;
  image?: string;
  coordinates?: { lat: number; lng: number };
}

@Injectable()
export class WikipediaService {
  private readonly logger = new Logger(WikipediaService.name);
  private readonly baseUrl = 'https://en.wikipedia.org/api/rest_v1';
  private readonly userAgent = 'TripVerse/1.0 (AI Travel Planner)';

  // =============================================
  // Public API
  // =============================================

  /**
   * Get a concise summary + main image for a place.
   * This is the primary method used by the enrichment pipeline.
   * Returns null if no Wikipedia article is found.
   */
  async getSummary(placeName: string): Promise<PlaceSummary | null> {
    try {
      this.logger.log(`Wikipedia summary: ${placeName}`);

      const response = await axios.get(
        `${this.baseUrl}/page/summary/${encodeURIComponent(placeName)}`,
        {
          timeout: 10000,
          headers: { 'User-Agent': this.userAgent },
        },
      );

      const data = response.data;
      if (!data || data.type !== 'standard') return null;

      const result: PlaceSummary = {
        title: data.title,
        summary: data.extract || '',
        url:
          data.content_urls?.desktop?.page ||
          data.content_urls?.mobile?.page ||
          '',
        image: data.thumbnail?.source || data.originalimage?.source,
      };

      if (data.coordinates) {
        result.coordinates = {
          lat: data.coordinates.lat,
          lng: data.coordinates.lon,
        };
      }

      this.logger.log(`Found article: ${result.title}`);
      return result;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.log(`No article for: ${placeName}`);
      } else {
        this.logger.warn(`Wikipedia API error for "${placeName}": ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Search Wikipedia for related articles (fallback when exact title doesn't match).
   * Returns up to `limit` results with short snippets.
   */
  async search(query: string, limit: number = 3): Promise<PlaceSummary[]> {
    try {
      const response = await axios.get('https://en.wikipedia.org/w/api.php', {
        params: {
          action: 'query',
          format: 'json',
          list: 'search',
          srsearch: query,
          srlimit: limit,
          srprop: 'snippet',
        },
        timeout: 10000,
        headers: { 'User-Agent': this.userAgent },
      });

      if (!response.data?.query?.search) return [];

      return response.data.query.search.map((item: any) => ({
        title: item.title,
        summary: item.snippet.replace(/<[^>]*>/g, ''), // Strip HTML tags
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
      }));
    } catch (error: any) {
      this.logger.warn(`Wikipedia search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Try getSummary first; if it fails, fall back to search + first result's summary.
   * When destination is provided, validates the result is geographically relevant
   * and retries with destination-qualified search if not.
   */
  async getSummaryWithFallback(placeName: string, destination?: string): Promise<PlaceSummary | null> {
    // Try exact match first
    const direct = await this.getSummary(placeName);
    if (direct) {
      // Validate relevance — if destination is provided, check the summary
      // isn't about a completely different place with the same name
      if (destination && direct.summary) {
        const isRelevant = this.isRelevantToDestination(direct, destination);
        if (!isRelevant) {
          this.logger.log(`Wikipedia result for "${placeName}" not relevant to ${destination}, retrying with destination qualifier`);
          // Try with destination qualifier
          const qualified = await this.getSummary(`${placeName} ${destination}`);
          if (qualified) return qualified;
          // Try search with destination
          const searchResults = await this.search(`${placeName} ${destination}`, 3);
          for (const sr of searchResults) {
            const candidate = await this.getSummary(sr.title);
            if (candidate && this.isRelevantToDestination(candidate, destination)) {
              return candidate;
            }
          }
          // Fall back to the direct result if nothing better found
        }
      }
      return direct;
    }

    // Fallback: search with destination context for better results
    const searchQuery = destination ? `${placeName} ${destination}` : placeName;
    const searchResults = await this.search(searchQuery, 3);
    for (const sr of searchResults) {
      const fallback = await this.getSummary(sr.title);
      if (fallback) return fallback;
    }

    return null;
  }

  /**
   * Check if a Wikipedia result is geographically relevant to the destination.
   * Prevents "Eagle's Nest" (Hunza) from returning the Kehlsteinhaus article.
   */
  private isRelevantToDestination(result: PlaceSummary, destination: string): boolean {
    const destWords = destination.toLowerCase().split(/[,\s]+/).filter(w => w.length > 2);
    const textToCheck = `${result.title} ${result.summary}`.toLowerCase();
    // Check if any destination word appears in the title or summary
    return destWords.some(word => textToCheck.includes(word));
  }
}
