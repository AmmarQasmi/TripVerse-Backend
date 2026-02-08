import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

export interface GooglePlacesReview {
  author_name: string;
  author_url?: string;
  profile_photo_url?: string;
  rating: number;
  text: string;
  time: number;
  relative_time_description?: string;
}

export interface GooglePlacesResult {
  place_id: string;
  name: string;
  formatted_address: string;
  rating?: number;
  user_ratings_total?: number;
  reviews?: GooglePlacesReview[];
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
  website?: string;
  international_phone_number?: string;
  opening_hours?: {
    open_now: boolean;
    weekday_text: string[];
  };
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
}

@Injectable()
export class GooglePlacesService {
  private readonly logger = new Logger(GooglePlacesService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';

  private readonly distanceMatrixApiKey: string;
  private readonly distanceMatrixBaseUrl = 'https://maps.googleapis.com/maps/api/distancematrix';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('GOOGLE_PLACES_API_KEY') || '';
    this.distanceMatrixApiKey = this.configService.get('GOOGLE_DISTANCE_MATRIX_API_KEY') || this.apiKey;
    
    if (!this.apiKey || this.apiKey.trim() === '') {
      this.logger.warn('Google Places API key not configured');
    } else {
      this.logger.log('Google Places API initialized with API key');
    }

    if (!this.distanceMatrixApiKey || this.distanceMatrixApiKey.trim() === '') {
      this.logger.warn('Google Distance Matrix API key not configured');
    } else {
      this.logger.log('Google Distance Matrix API initialized');
    }
  }

  /**
   * Search for a place by name only
   */
  async searchPlace(placeName: string): Promise<GooglePlacesResult | null> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Google Places API key not configured');
        return null;
      }

      this.logger.log(`Searching Google Places for: ${placeName}`);

      // Use Text Search API with just the place name
      const response = await axios.get(`${this.baseUrl}/textsearch/json`, {
        params: {
          query: placeName,
          key: this.apiKey,
        },
        timeout: 10000,
      });

      if (response.data?.results && response.data.results.length > 0) {
        const place = response.data.results[0];
        this.logger.log(`Found place: ${place.name} (${place.formatted_address || 'no address'})`);
        const placeId = place.place_id;

        // Get detailed place information including reviews
        return await this.getPlaceDetails(placeId);
      }

      this.logger.warn(`No place found for: ${placeName}`);
      return null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        this.logger.error('Error searching Google Places:', {
          message: axiosError.message,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          responseData: axiosError.response?.data,
        });
      } else {
        this.logger.error('Error searching Google Places:', (error as Error).message);
      }
      return null;
    }
  }

  /**
   * Get detailed place information including reviews
   */
  async getPlaceDetails(placeId: string): Promise<GooglePlacesResult | null> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Google Places API key not configured');
        return null;
      }

      this.logger.log(`Fetching place details for: ${placeId}`);

      // Use Place Details API
      const response = await axios.get(`${this.baseUrl}/details/json`, {
        params: {
          place_id: placeId,
          fields: 'place_id,name,formatted_address,rating,user_ratings_total,reviews,geometry,website,international_phone_number,opening_hours,photos',
          key: this.apiKey,
        },
        timeout: 10000,
      });

      if (response.data?.result) {
        const result = response.data.result;
        
        return {
          place_id: result.place_id,
          name: result.name,
          formatted_address: result.formatted_address,
          rating: result.rating,
          user_ratings_total: result.user_ratings_total,
          reviews: result.reviews?.map((review: any) => ({
            author_name: review.author_name,
            author_url: review.author_url,
            profile_photo_url: review.profile_photo_url,
            rating: review.rating,
            text: review.text,
            time: review.time,
            relative_time_description: review.relative_time_description,
          })),
          geometry: result.geometry ? {
            location: {
              lat: result.geometry.location.lat,
              lng: result.geometry.location.lng,
            },
          } : undefined,
          website: result.website,
          international_phone_number: result.international_phone_number,
          opening_hours: result.opening_hours ? {
            open_now: result.opening_hours.open_now,
            weekday_text: result.opening_hours.weekday_text || [],
          } : undefined,
          photos: result.photos?.map((photo: any) => ({
            photo_reference: photo.photo_reference,
            height: photo.height,
            width: photo.width,
          })),
        };
      }

      return null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        this.logger.error('Error fetching place details:', {
          message: axiosError.message,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          responseData: axiosError.response?.data,
        });
      } else {
        this.logger.error('Error fetching place details:', (error as Error).message);
      }
      return null;
    }
  }

  /**
   * Search for a place by coordinates (reverse geocoding + nearby search)
   */
  async searchPlaceByLocation(location: { lat: number; lng: number }, placeName?: string): Promise<GooglePlacesResult | null> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Google Places API key not configured');
        return null;
      }

      // If place name is provided, use text search by name only
      if (placeName) {
        return await this.searchPlace(placeName);
      }

      // Otherwise, use Nearby Search API
      this.logger.log(`Searching places near ${location.lat},${location.lng}`);

      const response = await axios.get(`${this.baseUrl}/nearbysearch/json`, {
        params: {
          location: `${location.lat},${location.lng}`,
          radius: 1000, // 1km radius
          type: 'tourist_attraction|point_of_interest',
          key: this.apiKey,
        },
        timeout: 10000,
      });

      if (response.data?.results && response.data.results.length > 0) {
        const place = response.data.results[0];
        return await this.getPlaceDetails(place.place_id);
      }

      return null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        this.logger.error('Error searching place by location:', {
          message: axiosError.message,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
        });
      } else {
        this.logger.error('Error searching place by location:', (error as Error).message);
      }
      return null;
    }
  }

  /**
   * Autocomplete place suggestions using Google Places Autocomplete API
   */
  async autocomplete(input: string, country?: string): Promise<Array<{ place_id: string; description: string; structured_formatting: { main_text: string; secondary_text: string } }>> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Google Places API key not configured');
        return [];
      }

      if (!input || input.trim().length < 2) {
        return [];
      }

      const params: any = {
        input: input.trim(),
        key: this.apiKey,
        types: 'geocode|establishment',
      };

      if (country) {
        params.components = `country:${country}`;
      }

      const response = await axios.get(`${this.baseUrl}/autocomplete/json`, {
        params,
        timeout: 5000,
      });

      if (response.data?.status === 'OK' && response.data?.predictions) {
        return response.data.predictions.map((prediction: any) => ({
          place_id: prediction.place_id,
          description: prediction.description,
          structured_formatting: {
            main_text: prediction.structured_formatting?.main_text || prediction.description,
            secondary_text: prediction.structured_formatting?.secondary_text || '',
          },
        }));
      }

      return [];
    } catch (error) {
      this.logger.error('Error fetching autocomplete suggestions:', (error as Error).message);
      return [];
    }
  }

  /**
   * Calculate driving distance between two locations using Distance Matrix API
   * @param origin Origin location (e.g., "Karachi, Pakistan")
   * @param destination Destination location (e.g., "Lahore, Pakistan")
   * @returns Distance in kilometers, or null if calculation fails
   */
  async calculateDistance(origin: string, destination: string): Promise<number | null> {
    try {
      if (!this.distanceMatrixApiKey || this.distanceMatrixApiKey.trim() === '') {
        this.logger.warn('Google Distance Matrix API key not configured');
        return null;
      }

      this.logger.log(`Calculating distance from ${origin} to ${destination}`);

      const response = await axios.get(`${this.distanceMatrixBaseUrl}/json`, {
        params: {
          origins: origin,
          destinations: destination,
          units: 'metric', // Returns distance in kilometers
          key: this.distanceMatrixApiKey,
        },
        timeout: 10000,
      });

      if (response.data?.status === 'OK' && response.data?.rows?.[0]?.elements?.[0]?.status === 'OK') {
        const element = response.data.rows[0].elements[0];
        const distanceInMeters = element.distance.value;
        const distanceInKm = distanceInMeters / 1000;
        
        this.logger.log(`Distance calculated: ${distanceInKm.toFixed(2)} km`);
        return Math.round(distanceInKm * 10) / 10; // Round to 1 decimal place
      }

      // Handle API errors
      if (response.data?.status === 'ZERO_RESULTS') {
        this.logger.warn(`No route found between ${origin} and ${destination}`);
        return null;
      }

      if (response.data?.status === 'NOT_FOUND') {
        this.logger.warn(`Location not found: ${origin} or ${destination}`);
        return null;
      }

      this.logger.error('Distance Matrix API error:', response.data?.status);
      return null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        this.logger.error('Error calculating distance:', {
          message: axiosError.message,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          responseData: axiosError.response?.data,
        });
      } else {
        this.logger.error('Error calculating distance:', (error as Error).message);
      }
      return null;
    }
  }
}

