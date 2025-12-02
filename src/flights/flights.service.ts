import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { SearchFlightsDto } from './dto/search-flights.dto';
import { CreateLinkSessionDto } from './dto/create-link-session.dto';

@Injectable()
export class FlightsService {
	private duffelClient: AxiosInstance;
	private readonly duffelApiKey: string;
	private readonly duffelApiUrl: string;
	private readonly appUrl: string;

	constructor(private configService: ConfigService) {
		this.duffelApiKey = this.configService.get<string>('DUFFEL_API_KEY') || '';
		this.duffelApiUrl = this.configService.get<string>('DUFFEL_API_URL') || 'https://api.duffel.com';
		this.appUrl = this.configService.get<string>('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000';

		if (!this.duffelApiKey) {
			console.warn('DUFFEL_API_KEY not found in environment variables');
		}

		// Initialize Duffel API client
		this.duffelClient = axios.create({
			baseURL: this.duffelApiUrl,
			headers: {
				'Authorization': `Bearer ${this.duffelApiKey}`,
				'Duffel-Version': 'v2',
				'Accept': 'application/json',
				'Content-Type': 'application/json',
			},
		});
	}

	/**
	 * Search for flights using Duffel API
	 */
	async searchFlights(searchParams: SearchFlightsDto) {
		try {
			// Create offer request
			const offerRequestData = {
				data: {
					slices: [
						{
							origin: searchParams.origin,
							destination: searchParams.destination,
							departure_date: searchParams.departure_date,
						},
					],
					passengers: [
						...Array(searchParams.adults).fill({ type: 'adult' }),
						...(searchParams.children ? Array(searchParams.children).fill({ type: 'child' }) : []),
						...(searchParams.infants ? Array(searchParams.infants).fill({ type: 'infant_without_seat' }) : []),
					],
					cabin_class: searchParams.cabin_class || 'economy',
				},
			};

			// Add return slice if return_date is provided
			if (searchParams.return_date) {
				offerRequestData.data.slices.push({
					origin: searchParams.destination,
					destination: searchParams.origin,
					departure_date: searchParams.return_date,
				});
			}

			// Create offer request
			const offerRequestResponse = await this.duffelClient.post('/air/offer_requests', offerRequestData);
			const offerRequestId = offerRequestResponse.data.data.id;

			// Wait a moment for offers to be generated
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Get offers
			const offersResponse = await this.duffelClient.get(`/air/offers?offer_request_id=${offerRequestId}`);
			const offers = offersResponse.data.data;

			// Transform offers to a more user-friendly format
			const formattedOffers = offers.map((offer: any) => this.formatOffer(offer));

			return {
				data: formattedOffers,
				offer_request_id: offerRequestId,
				total: formattedOffers.length,
			};
		} catch (error: any) {
			console.error('Duffel API Error:', error.response?.data || error.message);
			
			if (error.response?.status === 400) {
				throw new BadRequestException(
					error.response?.data?.errors?.[0]?.message || 'Invalid flight search parameters'
				);
			}
			
			if (error.response?.status === 401) {
				throw new BadRequestException('Invalid Duffel API credentials');
			}

			throw new InternalServerErrorException(
				error.response?.data?.errors?.[0]?.message || 'Failed to search flights. Please try again.'
			);
		}
	}

	/**
	 * Create a Duffel Link session for booking
	 */
	async createBookingLink(linkSessionData: CreateLinkSessionDto) {
		try {
			// For localhost, we can't use HTTP URLs (Duffel requires HTTPS)
			// Use placeholder HTTPS URLs for localhost development
			const isLocalhost = this.appUrl.includes('localhost') || this.appUrl.includes('127.0.0.1');
			
			const sessionData: any = {
				data: {
					reference: linkSessionData.reference || `booking_${Date.now()}`,
					flights: {
						enabled: true,
					},
				},
			};

			// Pre-select the specific flight offer if offer_id is provided
			if (linkSessionData.offer_id) {
				sessionData.data.flights.offer_id = linkSessionData.offer_id;
				sessionData.data.reference = `${linkSessionData.reference || 'booking'}_${linkSessionData.offer_id}`;
			}

			// Duffel requires redirect URLs - use placeholder HTTPS URLs for localhost
			// For localhost, users will stay on Duffel's page after booking (URLs won't work)
			if (isLocalhost) {
				// Use placeholder HTTPS URLs that Duffel will accept for validation
				sessionData.data.success_url = linkSessionData.success_url || 'https://example.com/success';
				sessionData.data.failure_url = linkSessionData.failure_url || 'https://example.com/failure';
				sessionData.data.abandonment_url = linkSessionData.abandonment_url || 'https://example.com/abandoned';
			} else {
				// Use provided URLs or construct from appUrl (must be HTTPS)
				sessionData.data.success_url = linkSessionData.success_url || `${this.appUrl}/flights/booking/success`;
				sessionData.data.failure_url = linkSessionData.failure_url || `${this.appUrl}/flights/booking/failure`;
				sessionData.data.abandonment_url = linkSessionData.abandonment_url || `${this.appUrl}/flights/booking/abandoned`;
			}

			const response = await this.duffelClient.post('/links/sessions', sessionData);

			return {
				booking_url: response.data.data.url,
				session_id: response.data.data.id,
				reference: response.data.data.reference,
			};
		} catch (error: any) {
			console.error('Duffel Link Creation Error:', error.response?.data || error.message);
			
			if (error.response?.status === 400) {
				throw new BadRequestException(
					error.response?.data?.errors?.[0]?.message || 'Invalid booking link parameters'
				);
			}
			
			if (error.response?.status === 401) {
				throw new BadRequestException('Invalid Duffel API credentials');
			}

			throw new InternalServerErrorException(
				error.response?.data?.errors?.[0]?.message || 'Failed to create booking link. Please try again.'
			);
		}
	}

	/**
	 * Format Duffel offer to a more user-friendly structure
	 */
	private formatOffer(offer: any) {
		const slices = offer.slices || [];
		const totalDuration = slices.reduce((sum: number, slice: any) => sum + (slice.duration_minutes || 0), 0);
		const totalStops = slices.reduce((sum: number, slice: any) => {
			return sum + (slice.segments?.length || 1) - 1;
		}, 0);

		// Get first and last segments for display
		const firstSlice = slices[0];
		const lastSlice = slices[slices.length - 1];
		const firstSegment = firstSlice?.segments?.[0];
		const lastSegment = lastSlice?.segments?.[lastSlice.segments.length - 1];

		return {
			id: offer.id,
			offer_id: offer.id,
			airline: firstSegment?.marketing_carrier?.name || 'Unknown Airline',
			airline_code: firstSegment?.marketing_carrier?.iata_code || '',
			flight_number: firstSegment?.marketing_carrier_flight_number || '',
			origin: {
				code: firstSlice?.origin?.iata_code || '',
				name: firstSlice?.origin?.name || '',
				city: firstSlice?.origin?.city_name || '',
			},
			destination: {
				code: lastSlice?.destination?.iata_code || '',
				name: lastSlice?.destination?.name || '',
				city: lastSlice?.destination?.city_name || '',
			},
			departure: {
				time: firstSegment?.departing_at || '',
				airport: firstSlice?.origin?.iata_code || '',
			},
			arrival: {
				time: lastSegment?.arriving_at || '',
				airport: lastSlice?.destination?.iata_code || '',
			},
			duration_minutes: totalDuration,
			duration_formatted: this.formatDuration(totalDuration),
			stops: totalStops,
			stops_formatted: totalStops === 0 ? 'Direct' : `${totalStops} stop${totalStops > 1 ? 's' : ''}`,
			price: {
				amount: offer.total_amount || '0',
				currency: offer.total_currency || 'USD',
				formatted: `${offer.total_currency || 'USD'} ${parseFloat(offer.total_amount || '0').toFixed(2)}`,
			},
			cabin_class: offer.cabin_class || 'economy',
			slices: slices.map((slice: any) => ({
				origin: slice.origin?.iata_code || '',
				destination: slice.destination?.iata_code || '',
				departure_time: slice.segments?.[0]?.departing_at || '',
				arrival_time: slice.segments?.[slice.segments.length - 1]?.arriving_at || '',
				duration_minutes: slice.duration_minutes || 0,
				segments: slice.segments?.map((seg: any) => ({
					airline: seg.marketing_carrier?.name || '',
					airline_code: seg.marketing_carrier?.iata_code || '',
					flight_number: seg.marketing_carrier_flight_number || '',
					departure: {
						airport: seg.origin?.iata_code || '',
						time: seg.departing_at || '',
					},
					arrival: {
						airport: seg.destination?.iata_code || '',
						time: seg.arriving_at || '',
					},
					duration_minutes: seg.duration_minutes || 0,
				})) || [],
			})),
		};
	}

	/**
	 * Format duration in minutes to human-readable format
	 */
	private formatDuration(minutes: number): string {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return `${hours}h ${mins}m`;
	}
}

