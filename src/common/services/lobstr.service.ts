import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface LobstrReview {
  author_name: string;
  author_url?: string;
  rating: number;
  text: string;
  time: number;
  relative_time_description?: string;
}

export interface LobstrResult {
  place_id?: string;
  name: string;
  formatted_address: string;
  rating?: number;
  user_ratings_total?: number;
  reviews?: LobstrReview[];
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

export interface LobstrTaskResponse {
  squid: string;
  tasks: Array<{
    id: string;
    url: string;
  }>;
}

export interface LobstrRunResponse {
  run: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  squid: string;
}

export interface LobstrRunStatus {
  run: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  squid: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class LobstrService {
  private readonly logger = new Logger(LobstrService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.lobstr.io/v1';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('LOBSTR_API_KEY') || '';
  }

  /**
   * Get available crawlers (squids) for Google Reviews
   */
  async getCrawlers(): Promise<any[]> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Lobstr API key not configured');
        return [];
      }

      const response = await axios.get(`${this.baseUrl}/crawlers`, {
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
        timeout: 10000,
      });

      return response.data?.results || [];
    } catch (error) {
      this.logger.error('Error fetching Lobstr crawlers:', (error as Error).message);
      return [];
    }
  }

  /**
   * Create a squid (scraper instance) for Google Reviews
   * Note: This should be done once and the squid_id stored
   */
  async createSquid(crawlerHash: string): Promise<string | null> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Lobstr API key not configured');
        return null;
      }

      const response = await axios.post(
        `${this.baseUrl}/squids`,
        {
          crawler: crawlerHash,
        },
        {
          headers: {
            Authorization: `Token ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      return response.data?.squid || null;
    } catch (error) {
      this.logger.error('Error creating Lobstr squid:', (error as Error).message);
      return null;
    }
  }

  /**
   * Submit a task to scrape Google Reviews for a place
   * @param squidId The squid ID to use
   * @param placeName The name of the place to search for
   * @param placeId Optional Google Place ID if available
   */
  async submitReviewTask(squidId: string, placeName: string, placeId?: string): Promise<string | null> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Lobstr API key not configured');
        return null;
      }

      // Construct Google Maps search URL
      const searchQuery = encodeURIComponent(placeName);
      const mapsUrl = placeId
        ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
        : `https://www.google.com/maps/search/?api=1&query=${searchQuery}`;

      this.logger.log(`Submitting Lobstr task for: ${placeName}`);

      const response = await axios.post(
        `${this.baseUrl}/tasks`,
        {
          squid: squidId,
          tasks: [
            {
              url: mapsUrl,
            },
          ],
        },
        {
          headers: {
            Authorization: `Token ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      return response.data?.tasks?.[0]?.id || null;
    } catch (error) {
      this.logger.error('Error submitting Lobstr task:', (error as Error).message);
      return null;
    }
  }

  /**
   * Start a run to execute the scraper
   */
  async startRun(squidId: string): Promise<string | null> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Lobstr API key not configured');
        return null;
      }

      const response = await axios.post(
        `${this.baseUrl}/runs`,
        {
          squid: squidId,
        },
        {
          headers: {
            Authorization: `Token ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const runHash = response.data?.run || null;
      if (runHash) {
        this.logger.log(`Started Lobstr run: ${runHash}`);
      }
      return runHash;
    } catch (error) {
      this.logger.error('Error starting Lobstr run:', (error as Error).message);
      return null;
    }
  }

  /**
   * Check the status of a run
   */
  async checkRunStatus(runHash: string): Promise<LobstrRunStatus | null> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Lobstr API key not configured');
        return null;
      }

      const response = await axios.get(`${this.baseUrl}/runs/${runHash}`, {
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
        timeout: 10000,
      });

      return response.data || null;
    } catch (error) {
      this.logger.error('Error checking Lobstr run status:', (error as Error).message);
      return null;
    }
  }

  /**
   * Get results from a completed run
   */
  async getRunResults(runHash: string): Promise<LobstrResult[] | null> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Lobstr API key not configured');
        return null;
      }

      const response = await axios.get(`${this.baseUrl}/results?run=${runHash}`, {
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
        timeout: 10000,
      });

      // Parse the results - Lobstr returns an array of results
      const results = response.data?.results || response.data || [];
      
      // Transform to our LobstrResult format
      return Array.isArray(results) ? results.map(this.transformResult) : [this.transformResult(results)];
    } catch (error) {
      this.logger.error('Error fetching Lobstr results:', (error as Error).message);
      return null;
    }
  }

  /**
   * Transform Lobstr API response to our LobstrResult format
   */
  private transformResult(data: any): LobstrResult {
    return {
      place_id: data.place_id,
      name: data.name || data.title || '',
      formatted_address: data.formatted_address || data.address || '',
      rating: data.rating || data.average_rating,
      user_ratings_total: data.user_ratings_total || data.total_reviews || data.reviews_count,
      reviews: this.transformReviews(data.reviews || []),
      geometry: data.geometry || (data.latitude && data.longitude ? {
        location: {
          lat: data.latitude,
          lng: data.longitude,
        },
      } : undefined),
    };
  }

  /**
   * Transform reviews array to our format
   */
  private transformReviews(reviews: any[]): LobstrReview[] {
    if (!Array.isArray(reviews)) return [];
    
    return reviews.map((review) => ({
      author_name: review.author_name || review.author || review.name || 'Anonymous',
      author_url: review.author_url || review.profile_url,
      rating: review.rating || 0,
      text: review.text || review.review_text || review.comment || '',
      time: review.time || review.timestamp || Date.now(),
      relative_time_description: review.relative_time_description || review.time_ago,
    }));
  }

  /**
   * Get or create a squid for Google Reviews scraping
   * This method will find the Google Reviews crawler and create a squid if needed
   */
  async getOrCreateSquid(): Promise<string | null> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Lobstr API key not configured');
        return null;
      }

      // First, try to get existing squids
      try {
        const squidsResponse = await axios.get(`${this.baseUrl}/squids`, {
          headers: {
            Authorization: `Token ${this.apiKey}`,
          },
          timeout: 10000,
        });

        const squids = squidsResponse.data?.results || squidsResponse.data || [];
        // Look for an existing squid (you can filter by name or other criteria)
        if (squids.length > 0) {
          // Use the first available squid
          const squidId = squids[0].squid || squids[0].id || squids[0].hash;
          if (squidId) {
            this.logger.log(`Using existing squid: ${squidId}`);
            return squidId;
          }
        }
      } catch (error) {
        this.logger.warn('Could not fetch existing squids, will create new one:', (error as Error).message);
      }

      // Get available crawlers
      const crawlers = await this.getCrawlers();
      if (crawlers.length === 0) {
        this.logger.error('No crawlers available');
        return null;
      }

      // Find Google Reviews crawler (look for keywords in name/description)
      const googleReviewsCrawler = crawlers.find((crawler: any) => {
        const name = (crawler.name || '').toLowerCase();
        const description = (crawler.description || '').toLowerCase();
        const title = (crawler.title || '').toLowerCase();
        return (
          (name.includes('google') || title.includes('google') || description.includes('google')) && 
          (name.includes('review') || name.includes('maps') || description.includes('review') || title.includes('review'))
        );
      });

      if (!googleReviewsCrawler) {
        this.logger.warn('Google Reviews crawler not found, using first available crawler');
        // Use the first available crawler as fallback
        if (crawlers.length === 0) {
          this.logger.error('No crawlers available');
          return null;
        }
        const crawlerHash = crawlers[0].crawler || crawlers[0].hash || crawlers[0].id;
        this.logger.log(`Using fallback crawler: ${crawlerHash}`);
        return await this.createSquid(crawlerHash);
      }

      const crawlerHash = googleReviewsCrawler.crawler || googleReviewsCrawler.hash || googleReviewsCrawler.id;
      this.logger.log(`Found Google Reviews crawler: ${crawlerHash}`);
      
      // Create a new squid
      const squidId = await this.createSquid(crawlerHash);
      if (squidId) {
        this.logger.log(`Created new squid for Google Reviews: ${squidId}`);
      }
      
      return squidId;
    } catch (error) {
      this.logger.error('Error getting/creating squid:', (error as Error).message);
      return null;
    }
  }

  /**
   * Complete workflow: Submit task, start run, and return run hash
   * This is a convenience method that combines multiple steps
   */
  async scrapePlaceReviews(placeName: string, placeId?: string, squidId?: string): Promise<string | null> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Lobstr API key not configured, skipping review scraping');
        return null;
      }

      // If squidId is not provided, we need to find or create one
      // For now, we'll require it to be passed or configured
      if (!squidId) {
        this.logger.warn('Squid ID not provided, cannot scrape reviews');
        return null;
      }

      // Submit task
      const taskId = await this.submitReviewTask(squidId, placeName, placeId);
      if (!taskId) {
        this.logger.warn('Failed to submit review task');
        return null;
      }

      // Start run
      const runHash = await this.startRun(squidId);
      if (!runHash) {
        this.logger.warn('Failed to start review run');
        return null;
      }

      return runHash;
    } catch (error) {
      this.logger.error('Error in scrapePlaceReviews workflow:', (error as Error).message);
      return null;
    }
  }
}

