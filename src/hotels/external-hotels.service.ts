import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

@Injectable()
export class ExternalHotelsService {
	private readonly apiKey: string;

	constructor(private configService: ConfigService) {
		this.apiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY') || '';
		if (!this.apiKey) {
			console.warn('GOOGLE_PLACES_API_KEY not found in environment variables');
		}
	}

	/**
	 * Build a resolvable photo URL from a Places photo_reference.
	 * The URL is proxied through our own backend to avoid exposing the API key to the client.
	 */
	private photoUrl(photoReference: string, maxWidth = 800): string {
		return `${PLACES_BASE}/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${this.apiKey}`;
	}

	/**
	 * Search hotels in a city using Google Places Text Search.
	 * Returns lightweight data suitable for card listing (no extra Detail calls).
	 *
	 * GET /hotels/external?city=Kuala+Lumpur
	 */
	async searchHotelsByCity(city: string) {
		if (!city || city.trim().length === 0) {
			throw new BadRequestException('city query parameter is required');
		}

		try {
			const response = await axios.get(`${PLACES_BASE}/textsearch/json`, {
				params: {
					query: `hotels in ${city.trim()}`,
					key: this.apiKey,
				},
			});

			const { status, results } = response.data;

			if (status === 'REQUEST_DENIED' || status === 'INVALID_REQUEST') {
				throw new InternalServerErrorException(`Google Places API error: ${status}`);
			}

			// ZERO_RESULTS is valid – just means no hotels found
			if (!results || results.length === 0) {
				return { success: true, data: [], total: 0 };
			}

			const hotels = results.map((place: any) => ({
				place_id: place.place_id,
				name: place.name,
				rating: place.rating ?? null,
				total_ratings: place.user_ratings_total ?? 0,
				address: place.formatted_address ?? '',
				price_level: place.price_level ?? null, // 0-4 scale
				business_status: place.business_status ?? 'OPERATIONAL',
				photos: place.photos
					? place.photos.slice(0, 4).map((p: any) => this.photoUrl(p.photo_reference))
					: [],
				// maps_url constructed from place_id — opens Google Maps listing
				maps_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
			}));

			return { success: true, data: hotels, total: hotels.length };
		} catch (error: any) {
			if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
				throw error;
			}
			throw new InternalServerErrorException('Failed to fetch external hotels');
		}
	}

	/**
	 * Fetch full details for a single hotel by place_id.
	 * Called only when a user clicks on a hotel card.
	 *
	 * GET /hotels/external/details/:placeId
	 */
	async getHotelDetails(placeId: string) {
		if (!placeId || placeId.trim().length === 0) {
			throw new BadRequestException('placeId is required');
		}

		try {
			const response = await axios.get(`${PLACES_BASE}/details/json`, {
				params: {
					place_id: placeId.trim(),
					fields: [
						'name',
						'rating',
						'user_ratings_total',
						'formatted_address',
						'formatted_phone_number',
						'website',
						'url',
						'photos',
						'price_level',
						'opening_hours',
						'business_status',
					].join(','),
					key: this.apiKey,
				},
			});

			const { status, result } = response.data;

			if (status === 'NOT_FOUND') {
				throw new BadRequestException('Hotel not found');
			}

			if (status === 'REQUEST_DENIED' || status === 'INVALID_REQUEST') {
				throw new InternalServerErrorException(`Google Places API error: ${status}`);
			}

			const photos = result.photos
				? result.photos.slice(0, 8).map((p: any) => this.photoUrl(p.photo_reference))
				: [];

			const website = result.website ?? null;
			const mapsUrl = result.url ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`;

			return {
				success: true,
				data: {
					place_id: placeId,
					name: result.name,
					rating: result.rating ?? null,
					total_ratings: result.user_ratings_total ?? 0,
					address: result.formatted_address ?? '',
					phone: result.formatted_phone_number ?? null,
					website,
					maps_url: mapsUrl,
					// Priority redirect: hotel's own website > Google Maps listing
					redirect_url: website ?? mapsUrl,
					price_level: result.price_level ?? null,
					business_status: result.business_status ?? 'OPERATIONAL',
					opening_hours: result.opening_hours?.weekday_text ?? null,
					photos,
				},
			};
		} catch (error: any) {
			if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
				throw error;
			}
			throw new InternalServerErrorException('Failed to fetch hotel details');
		}
	}
}
