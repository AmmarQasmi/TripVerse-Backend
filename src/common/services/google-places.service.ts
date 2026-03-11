import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { PrismaService } from '../../prisma/prisma.service';

export interface CityInfo {
  city_name: string;
  city_id?: number;
  metropolitan_area?: string; // For twin/metro cities like Islamabad-Rawalpindi
  // All administrative levels for robust comparison
  locality?: string;
  admin_area_level_2?: string;
  admin_area_level_1?: string;
}

export interface DistanceAndDuration {
  distance_km: number;
  duration_minutes: number;
}

// Metropolitan area mappings - cities that should be treated as same area for ride-hailing
const METROPOLITAN_AREAS: Record<string, string[]> = {
  'Islamabad-Rawalpindi': ['Islamabad', 'Rawalpindi', 'Pindi', 'Isb'],
  'Karachi Metropolitan': ['Karachi', 'Clifton', 'Defence', 'DHA Karachi', 'Gulshan-e-Iqbal'],
  'Lahore Metropolitan': ['Lahore', 'Gulberg', 'DHA Lahore', 'Model Town', 'Johar Town'],
  'Faisalabad Metropolitan': ['Faisalabad', 'Lyallpur'],
};

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
  private readonly geocodingBaseUrl = 'https://maps.googleapis.com/maps/api/geocode';

  private readonly distanceMatrixApiKey: string;
  private readonly distanceMatrixBaseUrl = 'https://maps.googleapis.com/maps/api/distancematrix';

  // Simple in-memory cache for API responses (performance optimization)
  private readonly cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache
  private readonly MAX_CACHE_SIZE = 1000; // Prevent unbounded growth

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => PrismaService)) private prisma: PrismaService,
  ) {
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
   * Get cached value if valid
   */
  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      this.logger.debug(`Cache hit for: ${key.substring(0, 50)}...`);
      return cached.data as T;
    }
    if (cached) {
      this.cache.delete(key); // Expired
    }
    return null;
  }

  /**
   * Set cache value with auto-cleanup
   */
  private setCache(key: string, data: any): void {
    // Clean up old entries if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (now - v.timestamp > this.CACHE_TTL_MS) {
          this.cache.delete(k);
        }
      }
      // If still full, delete oldest entries
      if (this.cache.size >= this.MAX_CACHE_SIZE) {
        const entriesToDelete = Math.floor(this.MAX_CACHE_SIZE / 4);
        const keys = Array.from(this.cache.keys()).slice(0, entriesToDelete);
        keys.forEach(k => this.cache.delete(k));
      }
    }
    this.cache.set(key, { data, timestamp: Date.now() });
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

  /**
   * Calculate both distance AND duration using Distance Matrix API
   * @param origin Origin location (e.g., "Karachi, Pakistan")
   * @param destination Destination location (e.g., "Lahore, Pakistan")
   * @returns Distance in kilometers and duration in minutes, or null if calculation fails
   */
  async getDistanceAndDuration(origin: string, destination: string): Promise<DistanceAndDuration | null> {
    try {
      if (!this.distanceMatrixApiKey || this.distanceMatrixApiKey.trim() === '') {
        this.logger.warn('Google Distance Matrix API key not configured');
        return null;
      }

      // Check cache first
      const cacheKey = `distance:${origin.toLowerCase().trim()}:${destination.toLowerCase().trim()}`;
      const cached = this.getCached<DistanceAndDuration>(cacheKey);
      if (cached) {
        return cached;
      }

      this.logger.log(`Calculating distance and duration from ${origin} to ${destination}`);

      const response = await axios.get(`${this.distanceMatrixBaseUrl}/json`, {
        params: {
          origins: origin,
          destinations: destination,
          units: 'metric',
          key: this.distanceMatrixApiKey,
        },
        timeout: 10000,
      });

      if (response.data?.status === 'OK' && response.data?.rows?.[0]?.elements?.[0]?.status === 'OK') {
        const element = response.data.rows[0].elements[0];
        const distanceInMeters = element.distance.value;
        const distanceInKm = distanceInMeters / 1000;
        const durationInSeconds = element.duration.value;
        const durationInMinutes = Math.ceil(durationInSeconds / 60);
        
        this.logger.log(`Distance: ${distanceInKm.toFixed(2)} km, Duration: ${durationInMinutes} minutes`);
        const result: DistanceAndDuration = {
          distance_km: Math.round(distanceInKm * 10) / 10,
          duration_minutes: durationInMinutes,
        };

        // Cache the result
        this.setCache(cacheKey, result);

        return result;
      }

      this.logger.warn(`Could not calculate distance/duration: ${response.data?.status}`);
      return null;
    } catch (error) {
      this.logger.error('Error calculating distance and duration:', (error as Error).message);
      return null;
    }
  }

  /**
   * Get city name from an address using Google Geocoding API
   * Also attempts to match against City table in database
   * @param address Full address string (e.g., "M.A. Jinnah Road, Karachi, Pakistan")
   * @returns City info with name and optional database ID
   */
  async getCityFromAddress(address: string): Promise<CityInfo | null> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Google Places API key not configured');
        return null;
      }

      // Check cache first
      const cacheKey = `city:${address.toLowerCase().trim()}`;
      const cached = this.getCached<CityInfo>(cacheKey);
      if (cached) {
        return cached;
      }

      this.logger.log(`Getting city from address: ${address}`);

      const response = await axios.get(`${this.geocodingBaseUrl}/json`, {
        params: {
          address: address,
          key: this.apiKey,
        },
        timeout: 10000,
      });

      if (response.data?.status === 'OK' && response.data?.results?.[0]) {
        const result = response.data.results[0];
        const addressComponents = result.address_components || [];

        // Extract all administrative levels for robust comparison
        let locality: string | null = null;
        let adminArea2: string | null = null;
        let adminArea1: string | null = null;

        for (const component of addressComponents) {
          if (component.types.includes('locality')) {
            locality = component.long_name;
          }
          if (component.types.includes('administrative_area_level_2')) {
            adminArea2 = component.long_name;
          }
          if (component.types.includes('administrative_area_level_1')) {
            adminArea1 = component.long_name;
          }
        }

        // For city name, prefer locality, then admin_area_level_2, then admin_area_level_1
        const cityName = locality || adminArea2 || adminArea1;

        if (!cityName) {
          this.logger.warn(`Could not extract city from address: ${address}`);
          return null;
        }

        this.logger.log(`Extracted city: ${cityName} (locality=${locality}, admin2=${adminArea2}, admin1=${adminArea1})`);

        // Try to match against database
        const cityFromDb = await this.prisma.city.findFirst({
          where: {
            OR: [
              { name: { equals: cityName, mode: 'insensitive' } },
              { name: { contains: cityName, mode: 'insensitive' } },
            ],
          },
        });

        // Detect metropolitan area - check all levels
        const metropolitanArea = this.getMetropolitanArea(cityName)
          || (adminArea2 ? this.getMetropolitanArea(adminArea2) : undefined)
          || (locality && locality !== cityName ? this.getMetropolitanArea(locality) : undefined);

        const cityInfo: CityInfo = {
          city_name: cityName,
          city_id: cityFromDb?.id,
          metropolitan_area: metropolitanArea,
          locality: locality || undefined,
          admin_area_level_2: adminArea2 || undefined,
          admin_area_level_1: adminArea1 || undefined,
        };

        // Cache the result
        this.setCache(cacheKey, cityInfo);

        return cityInfo;
      }

      this.logger.warn(`Geocoding failed for address: ${address} (${response.data?.status}), falling back to text parsing`);
      return this.extractCityFromText(address);
    } catch (error) {
      this.logger.error('Error getting city from address:', (error as Error).message);
      return this.extractCityFromText(address);
    }
  }

  /**
   * Fallback: extract city name from address text when Geocoding API fails
   * Addresses from Google Places autocomplete follow the pattern: "Location, Area, City, Country"
   * e.g. "Johar Mor Bridge, Block 10 A Gulistan-e-Johar, Karachi, Pakistan"
   */
  private async extractCityFromText(address: string): Promise<CityInfo | null> {
    const parts = address.split(',').map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length < 2) return null;

    // Known country names to skip
    const countryNames = ['pakistan', 'india', 'bangladesh', 'sri lanka'];
    // Known province/state names to skip
    const provinceNames = ['sindh', 'punjab', 'balochistan', 'kpk', 'khyber pakhtunkhwa', 
      'islamabad capital territory', 'gilgit-baltistan', 'azad kashmir'];

    // Walk from the end (last part is usually Country, second-to-last is City)
    let cityName: string | null = null;
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].toLowerCase();
      if (countryNames.includes(part)) continue;
      if (provinceNames.includes(part)) continue;
      cityName = parts[i];
      break;
    }

    if (!cityName) return null;

    this.logger.log(`Fallback city extraction from text: "${cityName}" from "${address}"`);

    // Try to match against database
    const cityFromDb = await this.prisma.city.findFirst({
      where: {
        OR: [
          { name: { equals: cityName, mode: 'insensitive' } },
          { name: { contains: cityName, mode: 'insensitive' } },
        ],
      },
    });

    const metropolitanArea = this.getMetropolitanArea(cityName);

    return {
      city_name: cityName,
      city_id: cityFromDb?.id,
      metropolitan_area: metropolitanArea,
    };
  }

  /**
   * Get the metropolitan area name for a city (if it belongs to one)
   */
  private getMetropolitanArea(cityName: string): string | undefined {
    const lowerCityName = cityName.toLowerCase();
    
    for (const [metro, cities] of Object.entries(METROPOLITAN_AREAS)) {
      if (cities.some(c => lowerCityName.includes(c.toLowerCase()) || c.toLowerCase().includes(lowerCityName))) {
        return metro;
      }
    }
    
    return undefined;
  }

  /**
   * Check if two cities are in the same metropolitan area
   */
  areSameMetropolitanArea(city1: CityInfo | null, city2: CityInfo | null): boolean {
    if (!city1 || !city2) return false;
    
    // Same city by database ID
    if (city1.city_id && city2.city_id && city1.city_id === city2.city_id) {
      return true;
    }
    
    // Same city name
    if (city1.city_name.toLowerCase() === city2.city_name.toLowerCase()) {
      return true;
    }
    
    // Same metropolitan area
    if (city1.metropolitan_area && city2.metropolitan_area && 
        city1.metropolitan_area === city2.metropolitan_area) {
      return true;
    }
    
    // Compare administrative_area_level_2 (broader city/district) - handles sub-localities
    // e.g., locality might be "Gulistan-e-Johar Town" but admin_level_2 is "Karachi Division" for both
    if (city1.admin_area_level_2 && city2.admin_area_level_2 &&
        city1.admin_area_level_2.toLowerCase() === city2.admin_area_level_2.toLowerCase()) {
      return true;
    }
    
    // Cross-check: one city's name might match the other's admin area
    const allNames1 = [city1.city_name, city1.locality, city1.admin_area_level_2].filter(Boolean).map(n => n!.toLowerCase());
    const allNames2 = [city2.city_name, city2.locality, city2.admin_area_level_2].filter(Boolean).map(n => n!.toLowerCase());
    
    for (const n1 of allNames1) {
      for (const n2 of allNames2) {
        if (n1 === n2) return true;
        // Check if one contains the other (e.g., "Karachi East" contains "Karachi")
        if (n1.includes(n2) || n2.includes(n1)) return true;
      }
    }
    
    return false;
  }

  /**
   * Determine if two addresses are in the same city or metropolitan area
   * @returns true if same city/metro, false if different cities, null if unable to determine
   */
  async areSameCity(address1: string, address2: string): Promise<boolean | null> {
    const city1 = await this.getCityFromAddress(address1);
    const city2 = await this.getCityFromAddress(address2);

    if (!city1 || !city2) {
      return null; // Unable to determine
    }

    // Use metropolitan area check which handles same city, same name, and metro areas
    return this.areSameMetropolitanArea(city1, city2);
  }
}

