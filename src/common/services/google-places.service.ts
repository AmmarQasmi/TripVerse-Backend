import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  rating?: number;
  user_ratings_total?: number;
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types?: string[];
  website?: string;
  international_phone_number?: string;
  opening_hours?: {
    open_now: boolean;
    weekday_text: string[];
  };
}

@Injectable()
export class GooglePlacesService {
  private readonly logger = new Logger(GooglePlacesService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('GOOGLE_PLACES_API_KEY') || '';
  }

  /**
   * Search for places by text query
   */
  async searchPlaces(query: string, location?: { lat: number; lng: number }): Promise<PlaceResult[]> {
    try {
      // Return empty array if API key is not configured
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Google Places API key not configured, skipping Places enrichment');
        return [];
      }

      this.logger.log(`Searching Google Places for: ${query}`);

      const params: any = {
        query,
        key: this.apiKey,
        fields: 'place_id,name,formatted_address,rating,user_ratings_total,photos,geometry,types,website,international_phone_number,opening_hours',
      };

      if (location) {
        params.location = `${location.lat},${location.lng}`;
        params.radius = 50000; // 50km radius
      }

      const response = await axios.get(`${this.baseUrl}/textsearch/json`, {
        params,
        timeout: 10000,
      });

      if (response.data?.results) {
        this.logger.log(`Found ${response.data.results.length} places`);
        return response.data.results;
      }

      return [];
    } catch (error) {
      this.logger.error('Google Places search error:', (error as Error).message);
      return [];
    }
  }

  /**
   * Get detailed information about a specific place
   */
  async getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/details/json`, {
        params: {
          place_id: placeId,
          key: this.apiKey,
          fields: 'place_id,name,formatted_address,rating,user_ratings_total,photos,geometry,types,website,international_phone_number,opening_hours,reviews,editorial_summary',
        },
        timeout: 10000,
      });

      if (response.data?.result) {
        return response.data.result;
      }

      return null;
    } catch (error) {
      this.logger.error('Google Places details error:', (error as Error).message);
      return null;
    }
  }

  /**
   * Get photo URL from photo reference
   */
  getPhotoUrl(photoReference: string, maxWidth: number = 400): string {
    return `${this.baseUrl}/photo?maxwidth=${maxWidth}&photoreference=${photoReference}&key=${this.apiKey}`;
  }

  /**
   * Search for nearby monuments/landmarks
   */
  async searchNearbyMonuments(location: { lat: number; lng: number }, radius: number = 5000): Promise<PlaceResult[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/nearbysearch/json`, {
        params: {
          location: `${location.lat},${location.lng}`,
          radius,
          type: 'tourist_attraction',
          keyword: 'monument landmark historical',
          key: this.apiKey,
          fields: 'place_id,name,formatted_address,rating,user_ratings_total,photos,geometry,types',
        },
        timeout: 10000,
      });

      if (response.data?.results) {
        return response.data.results.filter((place: any) => 
          place.types?.some((type: any) => 
            ['tourist_attraction', 'museum', 'church', 'mosque', 'temple'].includes(type)
          )
        );
      }

      return [];
    } catch (error) {
      this.logger.error('Nearby monuments search error:', (error as Error).message);
      return [];
    }
  }
}
