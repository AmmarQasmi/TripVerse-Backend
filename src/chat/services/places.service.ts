import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

// =============================================
// Interfaces
// =============================================

export interface PlacePhoto {
  /** Backend-proxied URL — safe to expose to frontend */
  url: string;
  width: number;
  height: number;
}

export interface PlaceReview {
  author: string;
  authorPhoto?: string;
  rating: number;
  text: string;
  timeDescription: string;
}

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  rating?: number;
  totalRatings?: number;
  coordinates?: { lat: number; lng: number };
  website?: string;
  phone?: string;
  openingHours?: { openNow: boolean; weekdayText: string[] };
  priceLevel?: number;
  photos: PlacePhoto[];
  reviews: PlaceReview[];
}

export interface NearbyPlace {
  placeId: string;
  name: string;
  type: string;
  rating?: number;
  totalRatings?: number;
  address: string;
  coordinates?: { lat: number; lng: number };
  photo?: PlacePhoto;
  openNow?: boolean;
}

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';

  /** Base URL for the photo proxy endpoint on this backend */
  private readonly photoProxyBase: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('GOOGLE_PLACES_API_KEY') || '';
    const backendUrl =
      this.configService.get('BACKEND_URL') ||
      `http://localhost:${this.configService.get('PORT') || 8000}`;
    this.photoProxyBase = `${backendUrl}/chat/photos`;

    if (!this.apiKey) {
      this.logger.warn('GOOGLE_PLACES_API_KEY not configured — Places features disabled');
    } else {
      this.logger.log('PlacesService initialized');
    }
  }

  // =============================================
  // Public API
  // =============================================

  /**
   * Search for a place by name/query.
   * Returns the best match with full details.
   */
  async searchPlace(query: string): Promise<PlaceResult | null> {
    if (!this.apiKey) return null;

    try {
      this.logger.log(`Searching place: ${query}`);

      const response = await axios.get(`${this.baseUrl}/textsearch/json`, {
        params: { query, key: this.apiKey },
        timeout: 10000,
      });

      if (!response.data?.results?.length) {
        this.logger.warn(`No results for: ${query}`);
        return null;
      }

      // Get full details for the top result
      return this.getPlaceDetails(response.data.results[0].place_id);
    } catch (error) {
      this.logError('searchPlace', error);
      return null;
    }
  }

  /**
   * Get detailed info for a place by its Google Place ID.
   * Includes: reviews, opening hours, price level, photos.
   */
  async getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
    if (!this.apiKey) return null;

    try {
      this.logger.log(`Fetching details: ${placeId}`);

      const response = await axios.get(`${this.baseUrl}/details/json`, {
        params: {
          place_id: placeId,
          fields: [
            'place_id',
            'name',
            'formatted_address',
            'rating',
            'user_ratings_total',
            'geometry',
            'website',
            'international_phone_number',
            'opening_hours',
            'price_level',
            'photos',
            'reviews',
          ].join(','),
          key: this.apiKey,
        },
        timeout: 10000,
      });

      const r = response.data?.result;
      if (!r) return null;

      return {
        placeId: r.place_id,
        name: r.name,
        address: r.formatted_address || '',
        rating: r.rating,
        totalRatings: r.user_ratings_total,
        coordinates: r.geometry?.location
          ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng }
          : undefined,
        website: r.website,
        phone: r.international_phone_number,
        openingHours: r.opening_hours
          ? {
              openNow: r.opening_hours.open_now ?? false,
              weekdayText: r.opening_hours.weekday_text || [],
            }
          : undefined,
        priceLevel: r.price_level,
        photos: this.mapPhotos(r.photos),
        reviews: (r.reviews || []).slice(0, 5).map((rev: any) => ({
          author: rev.author_name,
          authorPhoto: rev.profile_photo_url,
          rating: rev.rating,
          text: rev.text,
          timeDescription: rev.relative_time_description || '',
        })),
      };
    } catch (error) {
      this.logError('getPlaceDetails', error);
      return null;
    }
  }

  /**
   * Find nearby places of a given type around coordinates.
   * Types: 'restaurant', 'cafe', 'shopping_mall', 'tourist_attraction', 'market', etc.
   */
  async getNearbyPlaces(
    lat: number,
    lng: number,
    type: string,
    radiusMeters: number = 2000,
  ): Promise<NearbyPlace[]> {
    if (!this.apiKey) return [];

    try {
      this.logger.log(`Nearby search: type=${type} near ${lat},${lng}`);

      const response = await axios.get(`${this.baseUrl}/nearbysearch/json`, {
        params: {
          location: `${lat},${lng}`,
          radius: radiusMeters,
          type,
          key: this.apiKey,
        },
        timeout: 10000,
      });

      if (!response.data?.results) return [];

      return response.data.results.slice(0, 8).map((p: any) => ({
        placeId: p.place_id,
        name: p.name,
        type,
        rating: p.rating,
        totalRatings: p.user_ratings_total,
        address: p.vicinity || p.formatted_address || '',
        coordinates: p.geometry?.location
          ? { lat: p.geometry.location.lat, lng: p.geometry.location.lng }
          : undefined,
        photo: p.photos?.[0]
          ? this.mapPhotos([p.photos[0]])[0]
          : undefined,
        openNow: p.opening_hours?.open_now,
      }));
    } catch (error) {
      this.logError('getNearbyPlaces', error);
      return [];
    }
  }

  /**
   * Fetch the raw photo bytes from Google Places for a given photo reference.
   * Called by the photo proxy endpoint — never expose this to the frontend directly.
   * Returns { buffer, contentType } or null on failure.
   */
  async getPlacePhoto(
    photoReference: string,
    maxWidth: number = 800,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!this.apiKey) return null;

    try {
      const response = await axios.get(`${this.baseUrl}/photo`, {
        params: {
          photoreference: photoReference,
          maxwidth: maxWidth,
          key: this.apiKey,
        },
        responseType: 'arraybuffer',
        timeout: 15000,
      });

      return {
        buffer: Buffer.from(response.data),
        contentType: response.headers['content-type'] || 'image/jpeg',
      };
    } catch (error) {
      this.logError('getPlacePhoto', error);
      return null;
    }
  }

  // =============================================
  // Internal Helpers
  // =============================================

  /**
   * Convert raw Google photo objects → proxied PlacePhoto objects.
   * The URL points to OUR backend proxy, not Google directly.
   */
  private mapPhotos(photos: any[] | undefined, maxPhotos: number = 5): PlacePhoto[] {
    if (!photos) return [];

    return photos.slice(0, maxPhotos).map((p) => ({
      url: `${this.photoProxyBase}/${p.photo_reference}`,
      width: p.width,
      height: p.height,
    }));
  }

  private logError(method: string, error: unknown) {
    if (axios.isAxiosError(error)) {
      const e = error as AxiosError;
      this.logger.error(`${method} failed:`, {
        message: e.message,
        status: e.response?.status,
        data: e.response?.data,
      });
    } else {
      this.logger.error(`${method} failed: ${(error as Error).message}`);
    }
  }
}
