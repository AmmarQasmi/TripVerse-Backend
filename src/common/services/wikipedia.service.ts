import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface WikipediaResult {
  title: string;
  extract: string;
  url: string;
  thumbnail?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  categories?: string[];
}

@Injectable()
export class WikipediaService {
  private readonly logger = new Logger(WikipediaService.name);
  private readonly baseUrl = 'https://en.wikipedia.org/api/rest_v1';

  /**
   * Search for a monument on Wikipedia
   */
  async searchMonument(query: string): Promise<WikipediaResult | null> {
    try {
      this.logger.log(`Searching Wikipedia for: ${query}`);

      // First, search for the monument
      const searchResponse = await axios.get(`${this.baseUrl}/page/summary/${encodeURIComponent(query)}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'TripVerse/1.0 (Monument Recognition)',
        },
      });

      if (searchResponse.data && searchResponse.data.type === 'standard') {
        const result: WikipediaResult = {
          title: searchResponse.data.title,
          extract: searchResponse.data.extract,
          url: searchResponse.data.content_urls?.desktop?.page || searchResponse.data.content_urls?.mobile?.page,
        };

        // Add thumbnail if available
        if (searchResponse.data.thumbnail) {
          result.thumbnail = searchResponse.data.thumbnail.source;
        }

        // Add coordinates if available
        if (searchResponse.data.coordinates) {
          result.coordinates = {
            lat: searchResponse.data.coordinates.lat,
            lon: searchResponse.data.coordinates.lon,
          };
        }

        // Get categories
        try {
          const categoriesResponse = await axios.get(`${this.baseUrl}/page/categories/${encodeURIComponent(query)}`, {
            timeout: 5000,
            headers: {
              'User-Agent': 'TripVerse/1.0 (Monument Recognition)',
            },
          });

          if (categoriesResponse.data && categoriesResponse.data.categories) {
            result.categories = categoriesResponse.data.categories.map((cat: any) => cat.title);
          }
        } catch (catError) {
          this.logger.warn('Failed to fetch categories:', (catError as Error).message);
        }

        this.logger.log(`Found Wikipedia article: ${result.title}`);
        return result;
      }

      return null;
    } catch (error) {
      if ((error as any).response?.status === 404) {
        this.logger.log(`No Wikipedia article found for: ${query}`);
        return null;
      }
      
      this.logger.error('Wikipedia API error:', (error as Error).message);
      return null;
    }
  }

  /**
   * Get detailed information about a monument
   */
  async getMonumentDetails(title: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/page/html/${encodeURIComponent(title)}`, {
        timeout: 15000,
        headers: {
          'User-Agent': 'TripVerse/1.0 (Monument Recognition)',
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get monument details:', (error as Error).message);
      return null;
    }
  }

  /**
   * Search for similar monuments
   */
  async searchSimilarMonuments(query: string, limit: number = 5): Promise<WikipediaResult[]> {
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
        headers: {
          'User-Agent': 'TripVerse/1.0 (Monument Recognition)',
        },
      });

      if (response.data?.query?.search) {
        return response.data.query.search.map((item: any) => ({
          title: item.title,
          extract: item.snippet,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
        }));
      }

      return [];
    } catch (error) {
      this.logger.error('Similar monuments search error:', (error as Error).message);
      return [];
    }
  }
}
