import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef, Optional, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { NotificationsService as CommonNotificationsService } from '../common/services/notifications.service';
import { AdminService } from '../admin/admin.service';
import { GooglePlacesService, CityInfo } from '../common/services/google-places.service';
import { WeatherService } from '../weather/weather.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';
import { BookingType, Prisma } from '@prisma/client';
import axios from 'axios';

// =====================
// Types for Pricing Engine
// =====================

interface PricingBreakdown {
	base_price: number;
	distance_price: number;
	time_price?: number;
	surge_multiplier?: number;
	subtotal: number;
	total_amount: number;
	driver_earnings: number;
	platform_fee: number;
	platform_fee_percentage: number;
}

interface DetectedCities {
	pickup_city_id?: number;
	pickup_city_name?: string;
	dropoff_city_id?: number;
	dropoff_city_name?: string;
	same_city: boolean;
}

interface RentalPriceResult {
	booking_type: 'RENTAL';
	trip_duration_days: number;
	estimated_distance: number;
	pricing_breakdown: PricingBreakdown;
	detected_cities: DetectedCities;
}

interface RideHailingPriceResult {
	booking_type: 'RIDE_HAILING';
	estimated_duration: number;
	estimated_distance: number;
	surge_multiplier: number;
	pricing_breakdown: PricingBreakdown;
	detected_cities: DetectedCities;
}

type PriceCalculationResult = RentalPriceResult | RideHailingPriceResult;

// =====================
// Edge Case Constants
// =====================
const MINIMUM_DISTANCE_KM = 0.5; // 500 meters minimum for any trip
const MAX_RIDE_HAILING_DISTANCE_KM = 100; // Max distance for ride-hailing, suggest rental beyond

@Injectable()
export class CarsService {
	private readonly logger = new Logger(CarsService.name);

	constructor(
		@Inject(PrismaService) private prisma: PrismaService,
		private cloudinaryService: CloudinaryService,
		private notificationsService: CommonNotificationsService,
		@Inject(forwardRef(() => AdminService))
		private adminService: AdminService,
		private googlePlacesService: GooglePlacesService,
		private weatherService: WeatherService,
		private configService: ConfigService,
		@Optional() @Inject(forwardRef(() => ChatGateway))
		private chatGateway?: ChatGateway,
	) {}

	/**
	 * Autocomplete location suggestions using Google Places API
	 */
	async autocompleteLocation(input: string, country?: string) {
		const suggestions = await this.googlePlacesService.autocomplete(input, country);
		return { suggestions };
	}

	/**
	 * Search available cars with filters
	 * Only shows cars from verified drivers
	 * 
	 * booking_type filter:
	 * - RENTAL: available_for_rental = true AND no conflicting date bookings
	 * - RIDE_HAILING: available_for_ride_hailing = true AND current_mode = 'ride_hailing' AND no active rides
	 * - If not specified, returns all available cars
	 */
	async searchCars(query: any = {}) {
		const {
			city_id,
			location_query,
			start_date,
			end_date,
			seats,
			transmission,
			fuel_type,
			min_price,
			max_price,
			booking_type,
			page = 1,
			limit = 20,
		} = query;

		// Parse dates
		const startDate = start_date ? new Date(start_date) : null;
		const endDate = end_date ? new Date(end_date) : null;

		// Build WHERE conditions
		const where: any = {
			is_active: true,
			is_listed: true, // Only show listed cars
			driver: {
				is_verified: true, // Only verified drivers
				user: {
					status: 'active',
				},
			},
		};

		// Apply booking_type filter
		if (booking_type === 'RENTAL') {
			where.available_for_rental = true;
		} else if (booking_type === 'RIDE_HAILING') {
			where.available_for_ride_hailing = true;
			where.current_mode = 'ride_hailing'; // Only show cars with drivers currently online for ride-hailing
		}

		// Filter by city ID (exact match)
		if (city_id) {
			where.driver = {
				...where.driver,
				user: {
					...where.driver.user,
					city_id: parseInt(city_id),
				},
			};
		}
		// Filter by location text query (from pickup location search)
		else if (location_query) {
			// Extract all parts from autocomplete text (e.g., "Mazar-e-Quaid, M.A. Jinnah Road, Karachi, Pakistan")
			// Try matching any segment against city name or region
			const parts = location_query.split(',').map((p: string) => p.trim()).filter((p: string) => p.length > 0);
			const cityConditions = parts.flatMap((part: string) => [
				{ name: { contains: part, mode: 'insensitive' } },
				{ region: { contains: part, mode: 'insensitive' } },
			]);
			where.driver = {
				...where.driver,
				user: {
					...where.driver.user,
					city: {
						OR: cityConditions,
					},
				},
			};
		}

		// Filter by car specifications
		if (seats) where.seats = { gte: parseInt(seats) };
		if (transmission) where.transmission = transmission;
		if (fuel_type) where.fuel_type = fuel_type;

		// Filter by price range
		if (min_price || max_price) {
			where.base_price_per_day = {};
			if (min_price) where.base_price_per_day.gte = parseFloat(min_price);
			if (max_price) where.base_price_per_day.lte = parseFloat(max_price);
		}

		// Get available cars (excluding those with conflicting bookings)
		const availableCars = await this.prisma.car.findMany({
			where,
			include: {
				driver: {
					include: {
						user: {
							select: {
								id: true,
								full_name: true,
								city: {
									select: {
										id: true,
										name: true,
									},
								},
							},
						},
					},
				},
				carModel: true,
				images: {
					orderBy: { display_order: 'asc' },
					take: 1, // Primary image only
				},
				carBookings: {
					where: booking_type === 'RIDE_HAILING' ? {
						// For RIDE_HAILING: Check for active rides only
						booking_type: 'RIDE_HAILING',
						status: 'IN_PROGRESS',
					} : startDate && endDate ? {
						// For RENTAL: Check for date conflicts
						status: {
							in: ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'],
						},
						booking_type: 'RENTAL',
						OR: [
							{
								AND: [
									{ start_date: { lte: endDate } },
									{ end_date: { gte: startDate } },
								],
							},
						],
					} : {
						// Default: check for any active bookings
						status: {
							in: ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'],
						},
					},
				},
			},
			orderBy: [
				{ base_price_per_day: 'asc' },
				{ created_at: 'desc' },
			],
			skip: (page - 1) * limit,
			take: limit,
		});

		// Filter out cars with conflicting bookings or active rides
		const filteredCars = availableCars.filter((car) => {
			// For RIDE_HAILING: exclude cars with active rides
			if (booking_type === 'RIDE_HAILING') {
				return car.carBookings.length === 0;
			}
			// For RENTAL: exclude cars with date conflicts
			if (startDate && endDate) {
				return car.carBookings.length === 0;
			}
			return true;
		});

		// Transform response
		const formatted = filteredCars.map((car) => ({
			id: car.id.toString(),
			driver: {
				id: car.driver.user.id.toString(),
				name: car.driver.user.full_name,
				city: car.driver.user.city.name,
				isVerified: car.driver.is_verified,
			},
			car: {
				make: car.carModel.make,
				model: car.carModel.model,
				year: car.year,
				seats: car.seats,
				transmission: car.transmission,
				fuel_type: car.fuel_type,
				color: car.color,
				license_plate: car.license_plate,
			},
			pricing: {
				base_price_per_day: parseFloat(car.base_price_per_day.toString()),
				distance_rate_per_km: parseFloat(car.distance_rate_per_km.toString()),
				// Ride-hailing pricing (if available)
				...(car.available_for_ride_hailing && {
					base_fare: car.base_fare ? parseFloat(car.base_fare.toString()) : null,
					per_km_rate: car.per_km_rate ? parseFloat(car.per_km_rate.toString()) : null,
					per_minute_rate: car.per_minute_rate ? parseFloat(car.per_minute_rate.toString()) : null,
					minimum_fare: car.minimum_fare ? parseFloat(car.minimum_fare.toString()) : null,
				}),
			},
			availability: {
				available_for_rental: car.available_for_rental,
				available_for_ride_hailing: car.available_for_ride_hailing,
				current_mode: car.current_mode,
			},
			images: car.images.map((img) => img.image_url),
			createdAt: car.created_at.toISOString(),
		}));

		// Get total count for pagination
		const total = await this.prisma.car.count({
			where: {
				...where,
				// Exclude cars with conflicting bookings
				carBookings: {
					none: {
						status: {
							in: ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'],
						},
						...(startDate && endDate && {
							OR: [
								{
									AND: [
										{ start_date: { lte: endDate } },
										{ end_date: { gte: startDate } },
									],
								},
							],
						}),
					},
				},
			},
		});

		return {
			data: formatted,
			pagination: {
				page,
				limit,
				total: filteredCars.length,
				totalPages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Get single car details
	 */
	async findOne(id: number, isAdmin: boolean = false, driverId?: number) {
		const car = await this.prisma.car.findUnique({
			where: { id },
			include: {
				driver: {
					select: {
						id: true,
						user_id: true,
						is_verified: true,
						user: {
							select: {
								id: true,
								full_name: true,
								city: {
									select: {
										id: true,
										name: true,
									},
								},
							},
						},
					},
				},
				carModel: true,
				images: {
					orderBy: { display_order: 'asc' },
				},
			},
		});

		if (!car) {
			throw new NotFoundException('Car not found');
		}

		// For non-admin queries, check active status, driver verification and listing status
		if (!isAdmin) {
			// Check if this is the driver's own car
			const isCarDriver = driverId !== undefined && car.driver.user_id === driverId;
			
			if (!isCarDriver) {
				// For customers and drivers viewing other cars: car must be active, listed, and driver must be verified
				if (!car.is_active || !car.driver.is_verified || !car.is_listed) {
					throw new NotFoundException('Car not found');
				}
			} else {
				// Drivers can view their own cars even if inactive, but driver must be verified
				if (!car.driver.is_verified) {
					throw new NotFoundException('Driver not verified');
				}
			}
		}

		return {
			id: car.id.toString(),
			driver: {
				id: car.driver.user.id.toString(),
				name: car.driver.user.full_name,
				city: car.driver.user.city.name,
				isVerified: car.driver.is_verified,
			},
			car: {
				make: car.carModel.make,
				model: car.carModel.model,
				year: car.year,
				seats: car.seats,
				transmission: car.transmission,
				fuel_type: car.fuel_type,
				color: car.color,
				license_plate: car.license_plate,
			},
			pricing: {
				base_price_per_day: parseFloat(car.base_price_per_day.toString()),
				distance_rate_per_km: parseFloat(car.distance_rate_per_km.toString()),
				...(car.available_for_ride_hailing && {
					base_fare: car.base_fare ? parseFloat(car.base_fare.toString()) : null,
					per_km_rate: car.per_km_rate ? parseFloat(car.per_km_rate.toString()) : null,
					per_minute_rate: car.per_minute_rate ? parseFloat(car.per_minute_rate.toString()) : null,
					minimum_fare: car.minimum_fare ? parseFloat(car.minimum_fare.toString()) : null,
				}),
			},
			availability: {
				available_for_rental: car.available_for_rental,
				available_for_ride_hailing: car.available_for_ride_hailing,
				current_mode: car.current_mode,
			},
			images: car.images.map((img) => img.image_url),
			is_active: car.is_active,
			is_listed: car.is_listed,
			createdAt: car.created_at.toISOString(),
		};
	}

	/**
	 * Get unavailable dates or real-time availability status for a car
	 * 
	 * @param carId - Car ID
	 * @param mode - 'rental' returns date ranges, 'ride_hailing' returns real-time status
	 */
	async getUnavailableDates(carId: number, mode?: 'rental' | 'ride_hailing') {
		const car = await this.prisma.car.findUnique({
			where: { id: carId },
			include: {
				driver: {
					include: {
						user: {
							select: { full_name: true },
						},
					},
				},
			},
		});
		if (!car) throw new NotFoundException('Car not found');

		// For ride-hailing mode: return real-time availability status
		if (mode === 'ride_hailing') {
			// Check if car is in ride-hailing mode
			const isInRideHailingMode = car.current_mode === 'ride_hailing';
			const isAvailableForRideHailing = car.available_for_ride_hailing;

			// Check for active ride
			const activeRide = await this.prisma.carBooking.findFirst({
				where: {
					car_id: carId,
					booking_type: 'RIDE_HAILING',
					status: 'IN_PROGRESS',
				},
				select: {
					id: true,
					pickup_location: true,
					dropoff_location: true,
					created_at: true,
				},
			});

			// Check for pending requests
			const pendingRequests = await this.prisma.carBooking.count({
				where: {
					car_id: carId,
					booking_type: 'RIDE_HAILING',
					status: 'PENDING_DRIVER_ACCEPTANCE',
				},
			});

			return {
				car_id: carId,
				mode: 'ride_hailing',
				driver_name: car.driver.user.full_name,
				is_available: isInRideHailingMode && isAvailableForRideHailing && !activeRide,
				current_mode: car.current_mode,
				available_for_ride_hailing: isAvailableForRideHailing,
				has_active_ride: !!activeRide,
				active_ride: activeRide ? {
					id: activeRide.id,
					pickup: activeRide.pickup_location,
					dropoff: activeRide.dropoff_location,
					started_at: activeRide.created_at.toISOString(),
				} : null,
				pending_requests: pendingRequests,
			};
		}

		// Default / Rental mode: return unavailable date ranges
		const activeBookings = await this.prisma.carBooking.findMany({
			where: {
				car_id: carId,
				status: {
					in: ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'],
				},
				booking_type: 'RENTAL',
				end_date: { gte: new Date() },
			},
			select: {
				start_date: true,
				end_date: true,
				status: true,
			},
			orderBy: { start_date: 'asc' },
		});

		// Expand each booking range into individual dates
		const unavailableDates: string[] = [];
		for (const booking of activeBookings) {
			if (!booking.start_date || !booking.end_date) continue;
			const current = new Date(booking.start_date);
			const end = new Date(booking.end_date);
			while (current <= end) {
				unavailableDates.push(current.toISOString().split('T')[0]);
				current.setDate(current.getDate() + 1);
			}
		}

		return {
			car_id: carId,
			mode: 'rental',
			unavailable_dates: [...new Set(unavailableDates)].sort(),
			booking_ranges: activeBookings.map(b => ({
				start_date: b.start_date?.toISOString().split('T')[0] ?? null,
				end_date: b.end_date?.toISOString().split('T')[0] ?? null,
				status: b.status,
			})),
		};
	}

	/**
	 * Calculate price for a specific car and route (v2 - supports both booking types)
	 * 
	 * @param carId - Car ID
	 * @param dto - CalculatePriceDto with pickup, dropoff, and options
	 */
	async calculatePriceV2(
		carId: number,
		dto: {
			pickup_location: string;
			dropoff_location: string;
			booking_type?: 'RENTAL' | 'RIDE_HAILING';
			start_date?: string;
			end_date?: string;
			scheduled_pickup?: string;
			estimated_distance?: number;
		},
	): Promise<any> {
		const { pickup_location: pickupLocation, dropoff_location: dropoffLocation } = dto;
		const options = {
			bookingType: dto.booking_type,
			startDate: dto.start_date,
			endDate: dto.end_date,
			scheduledPickup: dto.scheduled_pickup,
			estimatedDistance: dto.estimated_distance,
		};

		const car = await this.prisma.car.findUnique({
			where: { id: carId },
			include: {
				driver: {
					include: {
						user: true,
					},
				},
			},
		});

		if (!car || !car.is_active || !car.driver.is_verified) {
			throw new NotFoundException('Car not found or driver not verified');
		}

		// Auto-detect booking type if not provided
		let bookingType: BookingType;
		let detectedBookingType: BookingType;
		let detectedCities: DetectedCities;

		// Always detect to get cities and auto-suggested type
		const detection = await this.detectBookingType(pickupLocation, dropoffLocation);
		detectedCities = detection.detectedCities;
		detectedBookingType = detection.bookingType;

		if (options.bookingType) {
			// User explicitly specified a type - use it
			bookingType = options.bookingType === 'RIDE_HAILING' ? BookingType.RIDE_HAILING : BookingType.RENTAL;
		} else {
			// Use auto-detected type
			bookingType = detectedBookingType;
		}

		// Get distance (and duration for ride-hailing)
		const distanceAndDuration = await this.estimateDistanceAndDuration(pickupLocation, dropoffLocation);
		let distance = options.estimatedDistance || distanceAndDuration.distance;
		const duration = distanceAndDuration.duration;

		// Edge case handling for distance
		// 1. Same pickup/dropoff (0 or very small distance) - enforce minimum distance
		if (distance < MINIMUM_DISTANCE_KM) {
			this.logger.warn(`Very short distance detected: ${distance} km. Enforcing minimum.`);
			distance = MINIMUM_DISTANCE_KM;
		}

		// 2. Very long intercity distances - cap at reasonable max (ride-hailing only)
		if (bookingType === BookingType.RIDE_HAILING && distance > MAX_RIDE_HAILING_DISTANCE_KM) {
			this.logger.warn(`Distance ${distance} km exceeds ride-hailing max. Suggesting rental.`);
			// Don't error, but we'll suggest rental in the response
		}

		// Calculate based on booking type
		if (bookingType === BookingType.RIDE_HAILING) {
			// For ride-hailing: use scheduled pickup or current time
			const scheduledPickup = options.scheduledPickup ? new Date(options.scheduledPickup) : new Date();
			
			// Estimate duration if not from API: distance_km ÷ 40 (average city speed) × 60 minutes
			const estimatedDuration = duration || Math.ceil((distance / 40) * 60);
			
			const pricing = this.calculateRideHailingPrice(car, distance, estimatedDuration, scheduledPickup);

			// Add warning for very long rides
			const distanceWarning = distance > MAX_RIDE_HAILING_DISTANCE_KM
				? `Distance of ${Math.round(distance)} km is quite long for ride-hailing. Consider a rental booking for better pricing.`
				: undefined;

			return {
				car_id: car.id,
				driver_id: car.driver.user.id,
				pickup_location: pickupLocation,
				dropoff_location: dropoffLocation,
				booking_type: 'RIDE_HAILING',
				detected_booking_type: detectedBookingType === BookingType.RIDE_HAILING ? 'RIDE_HAILING' : 'RENTAL',
				estimated_distance: distance,
				estimated_duration: estimatedDuration,
				surge_multiplier: pricing.surge_multiplier,
				scheduled_pickup: scheduledPickup.toISOString(),
				detected_cities: detectedCities,
				pricing_breakdown: pricing,
				...(distanceWarning && { distance_warning: distanceWarning }),
			};
		} else {
			// For rentals: require start and end dates
			if (!options.startDate || !options.endDate) {
				throw new BadRequestException('start_date and end_date are required for rental bookings');
			}

			const startDate = new Date(options.startDate);
			const endDate = new Date(options.endDate);
			const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

			const pricing = this.calculateRentalPrice(car, startDate, endDate, distance);

			return {
				car_id: car.id,
				driver_id: car.driver.user.id,
				pickup_location: pickupLocation,
				dropoff_location: dropoffLocation,
				booking_type: 'RENTAL',
				detected_booking_type: detectedBookingType === BookingType.RIDE_HAILING ? 'RIDE_HAILING' : 'RENTAL',
				estimated_distance: distance,
				trip_duration_days: days,
				detected_cities: detectedCities,
				pricing_breakdown: pricing,
			};
		}
	}

	/**
	 * Calculate price for a specific car and route (backward compatible - assumes RENTAL)
	 * @deprecated Use calculatePriceV2 for dual-mode support
	 */
	async calculatePrice(carId: number, pickupLocation: string, dropoffLocation: string, startDate: string, endDate: string, estimatedDistance?: number) {
		const car = await this.prisma.car.findUnique({
			where: { id: carId },
			include: {
				driver: {
					include: {
						user: true,
					},
				},
			},
		});

		if (!car || !car.is_active || !car.driver.is_verified) {
			throw new NotFoundException('Car not found or driver not verified');
		}

		// Calculate trip duration
		const start = new Date(startDate);
		const end = new Date(endDate);
		const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

		// Use provided distance or estimate
		let distance = estimatedDistance;
		if (!distance) {
			distance = await this.estimateDistance(pickupLocation, dropoffLocation);
		}

		// Calculate pricing (legacy rental formula)
		const basePrice = parseFloat(car.base_price_per_day.toString()) * days;
		const distancePrice = parseFloat(car.distance_rate_per_km.toString()) * distance;
		const totalAmount = basePrice + distancePrice;
		const platformFee = Math.round(totalAmount * 0.05); // 5% platform fee
		const driverEarnings = totalAmount - platformFee;

		return {
			car_id: car.id,
			driver_id: car.driver.user.id,
			pickup_location: pickupLocation,
			dropoff_location: dropoffLocation,
			estimated_distance: distance,
			trip_duration_days: days,
			pricing_breakdown: {
				base_price: basePrice,
				distance_price: distancePrice,
				total_amount: totalAmount,
				driver_earnings: driverEarnings,
				platform_fee: platformFee,
			},
		};
	}

	/**
	 * Create booking request (v2 - supports both RENTAL and RIDE_HAILING)
	 */
	async createBookingRequestV2(data: {
		car_id: number;
		user_id: number;
		pickup_location: string;
		dropoff_location: string;
		booking_type: 'RENTAL' | 'RIDE_HAILING';
		start_date?: string;
		end_date?: string;
		scheduled_pickup?: string;
		customer_notes?: string;
		payment_method?: 'online' | 'cash' | 'wallet';
	}) {
		const {
			car_id,
			user_id,
			pickup_location,
			dropoff_location,
			booking_type,
			start_date,
			end_date,
			scheduled_pickup,
			customer_notes,
			payment_method,
		} = data;

		// Validate car exists and is available
		const car = await this.prisma.car.findUnique({
			where: { id: car_id },
			include: {
				driver: {
					include: {
						user: true,
					},
				},
			},
		});

		if (!car || !car.is_active || !car.driver.is_verified) {
			throw new NotFoundException('Car not found or driver not verified');
		}

		// Convert booking type to enum
		const bookingTypeEnum = booking_type === 'RIDE_HAILING' ? BookingType.RIDE_HAILING : BookingType.RENTAL;

		// Check availability based on booking type
		const availabilityCheck = await this.checkCarAvailability(
			car_id,
			bookingTypeEnum,
			start_date ? new Date(start_date) : undefined,
			end_date ? new Date(end_date) : undefined,
		);

		if (!availabilityCheck.available) {
			throw new BadRequestException(availabilityCheck.reason || 'Car is not available');
		}

		// Calculate pricing using v2 method
		const priceCalculation = await this.calculatePriceV2(car_id, {
			pickup_location,
			dropoff_location,
			booking_type: booking_type,
			start_date,
			end_date,
			scheduled_pickup,
		});

		// Prepare booking data based on type
		const bookingData: any = {
			user_id,
			car_id,
			pickup_location,
			dropoff_location,
			estimated_distance: priceCalculation.estimated_distance,
			booking_type: bookingTypeEnum,
			status: 'PENDING_DRIVER_ACCEPTANCE',
			total_amount: priceCalculation.pricing_breakdown.total_amount,
			driver_earnings: priceCalculation.pricing_breakdown.driver_earnings,
			platform_fee: priceCalculation.pricing_breakdown.platform_fee,
			currency: 'pkr',
			customer_notes,
			payment_method: payment_method ?? 'online',
			requested_at: new Date(),
		};

		// Add type-specific fields
		if (booking_type === 'RENTAL') {
			bookingData.start_date = new Date(start_date!);
			bookingData.end_date = new Date(end_date!);
		} else {
			// RIDE_HAILING
			const pickupTime = scheduled_pickup ? new Date(scheduled_pickup) : new Date();
			bookingData.scheduled_pickup = pickupTime;
			bookingData.base_fare = priceCalculation.pricing_breakdown.base_price;
			bookingData.surge_multiplier = priceCalculation.surge_multiplier || 1.0;
			bookingData.estimated_duration = priceCalculation.estimated_duration;
		}

		// Store city IDs if detected
		if (priceCalculation.detected_cities?.pickup_city_id) {
			bookingData.pickup_city_id = priceCalculation.detected_cities.pickup_city_id;
		}
		if (priceCalculation.detected_cities?.dropoff_city_id) {
			bookingData.dropoff_city_id = priceCalculation.detected_cities.dropoff_city_id;
		}

		// Create booking
		const booking = await this.prisma.carBooking.create({
			data: bookingData,
			include: {
				user: {
					select: {
						id: true,
						full_name: true,
						email: true,
					},
				},
				car: {
					include: {
						carModel: true,
						driver: {
							include: {
								user: {
									select: {
										id: true,
										full_name: true,
										email: true,
									},
								},
							},
						},
					},
				},
			},
		});

		// Send notification to driver
		await this.notificationsService.notifyBookingRequest(
			booking.car.driver.user.id,
			booking.id,
			booking.user.full_name,
		);

		return {
			id: booking.id,
			status: booking.status,
			booking_type: booking.booking_type,
			message: booking_type === 'RIDE_HAILING'
				? 'Ride request sent to driver. You will be notified when they respond.'
				: 'Booking request sent to driver. You will be notified when they respond.',
			booking_details: {
				car: {
					make: booking.car.carModel.make,
					model: booking.car.carModel.model,
					year: booking.car.year,
				},
				driver: {
					name: booking.car.driver.user.full_name,
				},
				pickup_location: booking.pickup_location,
				dropoff_location: booking.dropoff_location,
				...(booking_type === 'RENTAL' && {
					start_date: booking.start_date?.toISOString().split('T')[0],
					end_date: booking.end_date?.toISOString().split('T')[0],
				}),
				...(booking_type === 'RIDE_HAILING' && {
					scheduled_pickup: booking.scheduled_pickup?.toISOString(),
					estimated_duration: priceCalculation.estimated_duration,
					surge_multiplier: priceCalculation.surge_multiplier,
				}),
				pricing: {
					total_amount: parseFloat(booking.total_amount.toString()),
					driver_earnings: parseFloat(booking.driver_earnings.toString()),
					platform_fee: parseFloat(booking.platform_fee.toString()),
				},
			},
		};
	}

	/**
	 * Create booking request (legacy - assumes RENTAL type)
	 * @deprecated Use createBookingRequestV2 for dual-mode support
	 */
	async createBookingRequest(data: any) {
		const { car_id, user_id, pickup_location, dropoff_location, start_date, end_date, customer_notes, payment_method } = data;

		// Validate car exists and is available
		const car = await this.prisma.car.findUnique({
			where: { id: car_id },
			include: {
				driver: {
					include: {
						user: true,
					},
				},
			},
		});

		if (!car || !car.is_active || !car.driver.is_verified) {
			throw new NotFoundException('Car not found or driver not verified');
		}

		// Check for existing bookings in the same date range
		const conflictingBookings = await this.prisma.carBooking.findMany({
			where: {
				car_id,
				status: {
					in: ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'],
				},
				OR: [
					{
						AND: [
							{ start_date: { lte: new Date(end_date) } },
							{ end_date: { gte: new Date(start_date) } },
						],
					},
				],
			},
		});

		if (conflictingBookings.length > 0) {
			throw new BadRequestException('Car is not available for the selected dates');
		}

		// Calculate pricing
		const priceCalculation = await this.calculatePrice(car_id, pickup_location, dropoff_location, start_date, end_date);

		// Create booking request
		const booking = await this.prisma.carBooking.create({
			data: {
				user_id,
				car_id,
				pickup_location,
				dropoff_location,
				estimated_distance: priceCalculation.estimated_distance,
				booking_type: BookingType.RENTAL,
				start_date: new Date(start_date),
				end_date: new Date(end_date),
				status: 'PENDING_DRIVER_ACCEPTANCE',
				total_amount: priceCalculation.pricing_breakdown.total_amount,
				driver_earnings: priceCalculation.pricing_breakdown.driver_earnings,
				platform_fee: priceCalculation.pricing_breakdown.platform_fee,
				currency: 'pkr',
				customer_notes,
				payment_method: payment_method ?? 'online',
				requested_at: new Date(),
			},
			include: {
				user: {
					select: {
						id: true,
						full_name: true,
						email: true,
					},
				},
				car: {
					include: {
						carModel: true,
						driver: {
							include: {
								user: {
									select: {
										id: true,
										full_name: true,
										email: true,
									},
								},
							},
						},
					},
				},
			},
		});

		// Send notification to driver
		await this.notificationsService.notifyBookingRequest(
			booking.car.driver.user.id,
			booking.id,
			booking.user.full_name,
		);

		return {
			id: booking.id,
			status: booking.status,
			message: 'Booking request sent to driver. You will be notified when they respond.',
			booking_details: {
				car: {
					make: booking.car.carModel.make,
					model: booking.car.carModel.model,
					year: booking.car.year,
				},
				driver: {
					name: booking.car.driver.user.full_name,
				},
				pricing: {
					total_amount: parseFloat(booking.total_amount.toString()),
					driver_earnings: parseFloat(booking.driver_earnings.toString()),
					platform_fee: parseFloat(booking.platform_fee.toString()),
				},
			},
		};
	}

	/**
	 * Cancel a booking (by the customer)
	 * Only PENDING_DRIVER_ACCEPTANCE and ACCEPTED bookings can be cancelled
	 */
	async cancelBooking(bookingId: number, userId: number) {
		const booking = await this.prisma.carBooking.findUnique({
			where: { id: bookingId },
			include: {
				car: {
					include: {
						driver: {
							include: {
								user: {
									select: { id: true, full_name: true },
								},
							},
						},
					},
				},
			},
		});

		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		if (booking.user_id !== userId) {
			throw new ForbiddenException('You can only cancel your own bookings');
		}

		if (!['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED'].includes(booking.status)) {
			throw new BadRequestException(
				'Only pending or accepted bookings can be cancelled',
			);
		}

		const updated = await this.prisma.carBooking.update({
			where: { id: bookingId },
			data: { status: 'CANCELLED' },
		});

		// Notify driver about cancellation
		try {
			await this.notificationsService.createNotification(
				booking.car.driver.user.id,
				'booking_rejected' as any,
				'Booking Cancelled',
				`A customer has cancelled their booking #${bookingId}.`,
			);
		} catch (e) {
			// Don't fail the cancellation if notification fails
		}

		return { message: 'Booking cancelled successfully', booking_id: updated.id };
	}

	/**
	 * Driver responds to booking request
	 */
	async respondToBooking(bookingId: number, driverId: number, response: 'accept' | 'reject', driverNotes?: string) {
		const booking = await this.prisma.carBooking.findUnique({
			where: { id: bookingId },
			include: {
				car: {
					include: {
						driver: {
							include: {
								user: {
									select: {
										id: true,
										full_name: true,
									},
								},
							},
						},
					},
				},
				user: true,
			},
		});

		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		if (booking.car.driver.user_id !== driverId) {
			throw new BadRequestException('You are not authorized to respond to this booking');
		}

		if (booking.status !== 'PENDING_DRIVER_ACCEPTANCE') {
			throw new BadRequestException('Booking is no longer pending');
		}

		// Update booking status
		const updatedBooking = await this.prisma.carBooking.update({
			where: { id: bookingId },
			data: {
				status: response === 'accept' ? 'ACCEPTED' : 'REJECTED',
				accepted_at: response === 'accept' ? new Date() : null,
				driver_notes: driverNotes,
			},
		});

		// Send notification to customer
		const driverName = booking.car.driver.user?.full_name || 'Driver';
		if (response === 'accept') {
			await this.notificationsService.notifyBookingAccepted(
				booking.user_id,
				bookingId,
				driverName,
			);
		} else {
			await this.notificationsService.notifyBookingRejected(
				booking.user_id,
				bookingId,
				driverName,
			);
		}

		return {
			id: updatedBooking.id,
			status: updatedBooking.status,
			message: response === 'accept' 
				? 'Booking accepted. Customer has been notified to complete payment.'
				: 'Booking rejected. Customer has been notified.',
		};
	}

	/**
	 * Process payment and confirm booking
	 */
	async confirmBooking(bookingId: number, userId: number) {
		const booking = await this.prisma.carBooking.findUnique({
			where: { id: bookingId },
			include: {
				car: {
					include: {
						driver: {
							include: {
								user: true,
							},
						},
					},
				},
				user: true,
			},
		});

		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		if (booking.user_id !== userId) {
			throw new BadRequestException('You are not authorized to confirm this booking');
		}

		if (booking.status !== 'ACCEPTED') {
			throw new BadRequestException('Booking must be accepted by driver before payment');
		}

		// TODO: Process payment with Stripe
		// const payment = await this.processPayment({
		//   amount: booking.total_amount,
		//   currency: booking.currency,
		//   customer_id: booking.user_id,
		//   driver_id: booking.car.driver.user_id,
		//   application_fee_amount: booking.platform_fee,
		// });

		// For now, simulate successful payment
		const payment = {
			id: `sim_${Date.now()}`,
			charge_id: `ch_${Date.now()}`,
			status: 'completed',
		};

		// Update booking status
		const updatedBooking = await this.prisma.carBooking.update({
			where: { id: bookingId },
			data: {
				status: 'CONFIRMED',
				confirmed_at: new Date(),
			},
		});

		// For online bookings: create payment transaction immediately
		// For cash bookings: payment is collected at trip end by the driver
		if (booking.payment_method === 'online') {
			const paymentTransaction = await this.prisma.paymentTransaction.create({
				data: {
					booking_car_id: bookingId,
					user_id: userId,
					amount: booking.total_amount,
					currency: booking.currency,
					application_fee_amount: booking.platform_fee,
					payment_method: 'online',
					status: 'completed',
				},
			});

			// Create Stripe payment details
			await this.prisma.stripePaymentDetails.create({
				data: {
					payment_transaction_id: paymentTransaction.id,
					stripe_payment_intent_id: payment.id,
					stripe_charge_id: payment.charge_id,
				},
			});
		}

		// Create chat for driver-customer communication
		await this.prisma.chat.create({
			data: {
				booking_id: bookingId,
			},
		});

		// Send confirmation notifications to customer and admin (not driver)
		// Customer notification
		await this.notificationsService.notifyBookingConfirmed(booking.user_id, bookingId, 'car');
		
		// Notify all admins about payment received (platform fee) — only for online payments
		if (booking.payment_method === 'online') {
			const admins = await this.prisma.user.findMany({
				where: { role: 'admin' },
				select: { id: true },
			});
			
			const adminNotificationPromises = admins.map(admin =>
				this.notificationsService.createNotification(
					admin.id,
					'payment_received',
					'Payment Received - Car Booking',
					`Car booking #${bookingId} payment of PKR ${parseFloat(booking.total_amount.toString()).toLocaleString()} has been received. Platform fee (5%): PKR ${parseFloat(booking.platform_fee.toString()).toLocaleString()}`,
					{ booking_id: bookingId, booking_type: 'car', amount: parseFloat(booking.total_amount.toString()), platform_fee: parseFloat(booking.platform_fee.toString()) },
				)
			);
			
			await Promise.all(adminNotificationPromises);
		}
		
		// Note: Driver is NOT notified here - they will be paid later when ride starts

		return {
			id: updatedBooking.id,
			status: updatedBooking.status,
			message: 'Booking confirmed! Chat has been created for communication.',
			payment_id: payment.id,
		};
	}

	/**
	 * Get user's bookings
	 */
	async getUserBookings(userId: number, status?: string) {
		const where: any = { user_id: userId };
		if (status) {
			where.status = status;
		}

		const bookings = await this.prisma.carBooking.findMany({
			where,
			include: {
				car: {
					include: {
						carModel: true,
						images: {
							take: 1,
							orderBy: { display_order: 'asc' },
						},
						driver: {
							include: {
								user: {
									include: {
										city: {
											select: {
												id: true,
												name: true,
											},
										},
									},
								},
							},
						},
					},
				},
				payments: {
					select: {
						id: true,
						status: true,
						amount: true,
					},
					orderBy: { created_at: 'desc' },
					take: 1,
				},
			},
			orderBy: { created_at: 'desc' },
		});

		return bookings.map((booking) => ({
			id: booking.id,
			status: booking.status,
			car: {
				make: booking.car.carModel.make,
				model: booking.car.carModel.model,
				year: booking.car.year,
				color: booking.car.color,
				seats: booking.car.seats,
				transmission: booking.car.transmission,
				fuel_type: booking.car.fuel_type,
				license_plate: booking.car.license_plate,
				image: booking.car.images?.[0]?.image_url || null,
			},
			driver: {
				id: booking.car.driver.user.id,
				name: booking.car.driver.user.full_name,
				email: booking.car.driver.user.email,
				city: booking.car.driver.user.city?.name || null,
				isVerified: booking.car.driver.is_verified,
			},
			pickup_location: booking.pickup_location,
			dropoff_location: booking.dropoff_location,
			estimated_distance: booking.estimated_distance
				? parseFloat(booking.estimated_distance.toString())
				: null,
			start_date: booking.start_date?.toISOString().split('T')[0] ?? null,
			end_date: booking.end_date?.toISOString().split('T')[0] ?? null,
			total_amount: parseFloat(booking.total_amount.toString()),
			driver_earnings: parseFloat(booking.driver_earnings.toString()),
			platform_fee: parseFloat(booking.platform_fee.toString()),
			currency: booking.currency,
			customer_notes: booking.customer_notes,
			driver_notes: booking.driver_notes,
			// Timestamps
			requested_at: booking.requested_at?.toISOString() || null,
			accepted_at: booking.accepted_at?.toISOString() || null,
			confirmed_at: booking.confirmed_at?.toISOString() || null,
			started_at: booking.started_at?.toISOString() || null,
			completed_at: booking.completed_at?.toISOString() || null,
			created_at: booking.created_at.toISOString(),
			// Payment
			payment: booking.payments?.[0]
				? {
						id: booking.payments[0].id,
						status: booking.payments[0].status,
						amount: parseFloat(booking.payments[0].amount.toString()),
					}
				: null,
			payment_method: booking.payment_method,
			cash_collected: booking.cash_collected,
		}));
	}

	/**
	 * Get driver's bookings
	 */
	async getDriverBookings(driverId: number, status?: string) {
		const where: any = {
			car: {
				driver: {
					user_id: driverId,
				},
			},
		};
		if (status) {
			where.status = status;
		}

		const bookings = await this.prisma.carBooking.findMany({
			where,
			include: {
				user: {
					select: {
						id: true,
						full_name: true,
					},
				},
				car: {
					include: {
						carModel: true,
					},
				},
			},
			orderBy: { created_at: 'desc' },
		});

		return bookings.map((booking) => ({
			id: booking.id,
			status: booking.status,
			customer: {
				name: booking.user.full_name,
			},
			car: {
				make: booking.car.carModel.make,
				model: booking.car.carModel.model,
				year: booking.car.year,
			},
			pickup_location: booking.pickup_location,
			dropoff_location: booking.dropoff_location,
			start_date: booking.start_date?.toISOString().split('T')[0] ?? null,
			end_date: booking.end_date?.toISOString().split('T')[0] ?? null,
			total_amount: parseFloat(booking.total_amount.toString()),
			driver_earnings: parseFloat(booking.driver_earnings.toString()),
			platform_fee: parseFloat(booking.platform_fee.toString()),
			payment_method: booking.payment_method,
			cash_collected: booking.cash_collected,
			created_at: booking.created_at.toISOString(),
		}));
	}

	/**
	 * Start trip (driver marks trip as started after OTP verification)
	 * This is when payment is processed and driver gets paid
	 */
	async startTrip(bookingId: number, driverId: number, otpCode?: string) {
		const booking = await this.prisma.carBooking.findUnique({
			where: { id: bookingId },
			include: {
				car: {
					include: {
						driver: {
							include: {
								user: {
									select: {
										id: true,
										full_name: true,
									},
								},
							},
						},
					},
				},
				user: true,
			},
		});

		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		if (booking.car.driver.user_id !== driverId) {
			throw new BadRequestException('You are not authorized to start this trip');
		}

		if (booking.status !== 'CONFIRMED') {
			throw new BadRequestException('Booking must be confirmed before starting trip');
		}

		// TODO: Verify OTP with customer
		// if (!otpCode || !this.verifyOTP(booking.user_id, otpCode)) {
		//   throw new BadRequestException('Invalid OTP code');
		// }

		// Process payment to driver (money held in escrow until now)
		// TODO: Process driver payout with Stripe
		// const payout = await this.processDriverPayout({
		//   driver_id: booking.car.driver.user_id,
		//   amount: booking.driver_earnings,
		//   booking_id: bookingId,
		// });

		// For now, simulate successful payout
		const payout = {
			id: `payout_${Date.now()}`,
			status: 'completed',
		};

		const updatedBooking = await this.prisma.carBooking.update({
			where: { id: bookingId },
			data: {
				status: 'IN_PROGRESS',
				started_at: new Date(),
			},
		});

		// Send notification to customer
		const driverName = booking.car.driver.user?.full_name || 'Driver';
		await this.notificationsService.notifyTripStarted(booking.user_id, bookingId, driverName);

		return {
			id: updatedBooking.id,
			status: updatedBooking.status,
			message: 'Trip started successfully. Payment has been released to driver.',
			payout_id: payout.id,
		};
	}

	/**
	 * Complete trip (driver marks trip as completed)
	 * Payment was already processed when trip started
	 */
	async completeTrip(bookingId: number, driverId: number) {
		const booking = await this.prisma.carBooking.findUnique({
			where: { id: bookingId },
			include: {
				car: {
					include: {
						driver: true,
					},
				},
			},
		});

		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		if (booking.car.driver.user_id !== driverId) {
			throw new BadRequestException('You are not authorized to complete this trip');
		}

		if (booking.status !== 'IN_PROGRESS') {
			throw new BadRequestException('Trip must be in progress before completing');
		}

		const updatedBooking = await this.prisma.carBooking.update({
			where: { id: bookingId },
			data: {
				status: 'COMPLETED',
				completed_at: new Date(),
			},
		});

		// Send completion notification
		const bookingWithUser = await this.prisma.carBooking.findUnique({
			where: { id: bookingId },
			include: {
				car: {
					include: {
						driver: {
							include: {
								user: true,
							},
						},
					},
				},
			},
		});

		if (bookingWithUser) {
			const driverName = bookingWithUser.car.driver.user?.full_name || 'Driver';
			await this.notificationsService.notifyTripCompleted(
				bookingWithUser.user_id,
				bookingId,
				driverName,
			);

			// Resume any paused suspensions/bans after trip completion
			const driverId = bookingWithUser.car.driver_id;
			try {
				await this.adminService.resumeSuspensionAfterRide(driverId, bookingId);
			} catch (error) {
				// Log error but don't fail trip completion
				console.error('Error resuming suspension after ride:', error);
			}
		}

		return {
			id: updatedBooking.id,
			status: updatedBooking.status,
			message: 'Trip completed successfully',
		};
	}

	/**
	 * Collect cash payment (driver confirms cash collected after trip completion)
	 * Only valid for cash-payment bookings in COMPLETED state
	 */
	async collectCash(bookingId: number, driverId: number, collectedAmount: number) {
		const booking = await this.prisma.carBooking.findUnique({
			where: { id: bookingId },
			include: {
				car: {
					include: {
						driver: {
							include: {
								user: true,
							},
						},
					},
				},
			},
		});

		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		if (booking.car.driver.user_id !== driverId) {
			throw new BadRequestException('You are not authorized to collect cash for this booking');
		}

		if (booking.payment_method !== 'cash') {
			throw new BadRequestException('This booking is not a cash payment booking');
		}

		if (booking.status !== 'COMPLETED') {
			throw new BadRequestException('Trip must be completed before collecting cash');
		}

		if (booking.cash_collected) {
			throw new BadRequestException('Cash has already been collected for this booking');
		}

		// Exact amount validation — driver must enter the pre-calculated fare
		const expectedAmount = parseFloat(booking.total_amount.toString());
		if (Math.round(collectedAmount) !== Math.round(expectedAmount)) {
			throw new BadRequestException(
				`Collected amount must equal PKR ${Math.round(expectedAmount).toLocaleString()}`,
			);
		}

		const platformFee = parseFloat(booking.platform_fee.toString());

		// Mark cash as collected
		await this.prisma.carBooking.update({
			where: { id: bookingId },
			data: { cash_collected: true },
		});

		// Create payment transaction record for cash
		await this.prisma.paymentTransaction.create({
			data: {
				booking_car_id: bookingId,
				user_id: booking.user_id,
				amount: booking.total_amount,
				currency: booking.currency,
				application_fee_amount: booking.platform_fee,
				payment_method: 'cash',
				status: 'completed',
			},
		});

		// Deduct platform commission (5%) from driver's wallet_balance (can go negative = debt)
		await this.prisma.user.update({
			where: { id: driverId },
			data: {
				wallet_balance: {
					decrement: platformFee,
				},
			},
		});

		// Get updated wallet balance
		const updatedDriver = await this.prisma.user.findUnique({
			where: { id: driverId },
			select: { wallet_balance: true },
		});

		const driverEarnings = parseFloat(booking.driver_earnings.toString());
		const newWalletBalance = parseFloat(updatedDriver?.wallet_balance?.toString() ?? '0');

		// Notify driver
		await this.notificationsService.createNotification(
			driverId,
			'payment_received',
			'Cash Collection Confirmed',
			`You have successfully collected PKR ${Math.round(expectedAmount).toLocaleString()} in cash for booking #${bookingId}. Platform commission of PKR ${Math.round(platformFee).toLocaleString()} has been deducted from your wallet. Your net earnings for this trip: PKR ${Math.round(driverEarnings).toLocaleString()}.`,
			{ booking_id: bookingId, amount: expectedAmount, platform_fee: platformFee, driver_earnings: driverEarnings, wallet_balance: newWalletBalance },
		);

		// Notify admins about cash collection
		const admins = await this.prisma.user.findMany({
			where: { role: 'admin' },
			select: { id: true },
		});

		await Promise.all(admins.map(admin =>
			this.notificationsService.createNotification(
				admin.id,
				'payment_received',
				'Cash Payment Collected - Car Booking',
				`Driver has collected PKR ${Math.round(expectedAmount).toLocaleString()} cash for booking #${bookingId}. Platform fee (5%): PKR ${Math.round(platformFee).toLocaleString()} deducted from driver wallet.`,
				{ booking_id: bookingId, booking_type: 'car', payment_method: 'cash', amount: expectedAmount, platform_fee: platformFee },
			)
		));

		return {
			message: 'Cash payment confirmed successfully',
			booking_id: bookingId,
			total_collected: Math.round(expectedAmount),
			platform_fee_deducted: Math.round(platformFee),
			your_earnings: Math.round(driverEarnings),
			wallet_balance: newWalletBalance,
		};
	}

	/**
	 * Helper method to estimate distance using Google Maps Distance Matrix API
	 */
	private async estimateDistance(pickup: string, dropoff: string): Promise<number> {
		try {
			const distance = await this.googlePlacesService.calculateDistance(pickup, dropoff);
			
			if (distance !== null) {
				return distance;
			}

			// Fallback: Return a placeholder distance if API fails
			// This could be improved with a city-to-city lookup table
			return 100; // 100km placeholder
		} catch (error) {
			console.error('Error estimating distance:', error);
			// Fallback to placeholder
			return 100; // 100km placeholder
		}
	}

	/**
	 * Helper method to estimate distance AND duration
	 */
	private async estimateDistanceAndDuration(pickup: string, dropoff: string): Promise<{ distance: number; duration: number }> {
		try {
			const result = await this.googlePlacesService.getDistanceAndDuration(pickup, dropoff);
			
			if (result !== null) {
				return {
					distance: result.distance_km,
					duration: result.duration_minutes,
				};
			}

			// Fallback: Estimate duration based on distance at 40 km/h average
			const fallbackDistance = 100;
			return {
				distance: fallbackDistance,
				duration: Math.ceil((fallbackDistance / 40) * 60), // minutes
			};
		} catch (error) {
			console.error('Error estimating distance and duration:', error);
			return {
				distance: 100,
				duration: 150, // 2.5 hours fallback
			};
		}
	}

	/**
	 * Calculate surge multiplier based on date/time
	 * - Weekday peak hours (7-9am, 5-7pm): 1.3x
	 * - Weekends: 1.2x
	 * - Otherwise: 1.0x
	 */
	private calculateSurgeMultiplier(dateTime: Date): number {
		const hour = dateTime.getHours();
		const dayOfWeek = dateTime.getDay(); // 0 = Sunday, 6 = Saturday

		// Weekend surge
		if (dayOfWeek === 0 || dayOfWeek === 6) {
			return 1.2;
		}

		// Weekday peak hours
		const isMorningPeak = hour >= 7 && hour < 9;
		const isEveningPeak = hour >= 17 && hour < 19;

		if (isMorningPeak || isEveningPeak) {
			return 1.3;
		}

		// Normal hours
		return 1.0;
	}

	/**
	 * Calculate rental pricing (city-to-city, multi-day)
	 * Formula: (Days × base_price_per_day) + (Distance × distance_rate_per_km) - 5% platform fee
	 */
	private calculateRentalPrice(
		car: any,
		startDate: Date,
		endDate: Date,
		distance: number,
	): PricingBreakdown {
		const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
		
		const basePricePerDay = parseFloat(car.base_price_per_day?.toString() || '0');
		const distanceRatePerKm = parseFloat(car.distance_rate_per_km?.toString() || '0');

		const basePrice = basePricePerDay * days;
		const distancePrice = distanceRatePerKm * distance;
		const subtotal = basePrice + distancePrice;
		
		const platformFeePercentage = 0.05; // 5% for rentals
		const platformFee = Math.round(subtotal * platformFeePercentage);
		const driverEarnings = subtotal - platformFee;

		return {
			base_price: basePrice,
			distance_price: distancePrice,
			subtotal,
			total_amount: subtotal,
			driver_earnings: driverEarnings,
			platform_fee: platformFee,
			platform_fee_percentage: platformFeePercentage * 100,
		};
	}

	/**
	 * Calculate ride-hailing pricing (within-city)
	 * Formula: Base Fare + (Distance × per_km_rate) + (Duration × per_minute_rate) × surge_multiplier
	 * Minimum fare applies, 15% platform fee
	 */
	private calculateRideHailingPrice(
		car: any,
		distance: number,
		duration: number,
		scheduledPickup: Date,
	): PricingBreakdown {
		const baseFare = parseFloat(car.base_fare?.toString() || '50');
		const perKmRate = parseFloat(car.per_km_rate?.toString() || '15');
		const perMinuteRate = parseFloat(car.per_minute_rate?.toString() || '2');
		const minimumFare = parseFloat(car.minimum_fare?.toString() || '100');

		const distanceFare = distance * perKmRate;
		const timeFare = duration * perMinuteRate;
		const subtotal = baseFare + distanceFare + timeFare;

		const surgeMultiplier = this.calculateSurgeMultiplier(scheduledPickup);
		const fareAfterSurge = subtotal * surgeMultiplier;
		const totalAmount = Math.max(fareAfterSurge, minimumFare);

		const platformFeePercentage = 0.15; // 15% for ride-hailing
		const platformFee = Math.round(totalAmount * platformFeePercentage);
		const driverEarnings = totalAmount - platformFee;

		return {
			base_price: baseFare,
			distance_price: distanceFare,
			time_price: timeFare,
			surge_multiplier: surgeMultiplier,
			subtotal,
			total_amount: Math.round(totalAmount),
			driver_earnings: Math.round(driverEarnings),
			platform_fee: platformFee,
			platform_fee_percentage: platformFeePercentage * 100,
		};
	}

	/**
	 * Auto-detect booking type based on pickup/dropoff cities
	 * Returns RIDE_HAILING if same city/metropolitan area, RENTAL if different cities
	 */
	private async detectBookingType(
		pickupLocation: string,
		dropoffLocation: string,
	): Promise<{ bookingType: BookingType; detectedCities: DetectedCities }> {
		const [pickupCity, dropoffCity] = await Promise.all([
			this.googlePlacesService.getCityFromAddress(pickupLocation),
			this.googlePlacesService.getCityFromAddress(dropoffLocation),
		]);

		// If we can't detect cities, default to RENTAL (safer assumption)
		if (!pickupCity || !dropoffCity) {
			const detectedCities: DetectedCities = {
				pickup_city_id: pickupCity?.city_id,
				pickup_city_name: pickupCity?.city_name,
				dropoff_city_id: dropoffCity?.city_id,
				dropoff_city_name: dropoffCity?.city_name,
				same_city: false,
			};
			return { bookingType: BookingType.RENTAL, detectedCities };
		}

		// Use metropolitan area check for twin cities (e.g., Islamabad-Rawalpindi)
		const isSameArea = this.googlePlacesService.areSameMetropolitanArea(pickupCity, dropoffCity);

		const detectedCities: DetectedCities = {
			pickup_city_id: pickupCity.city_id,
			pickup_city_name: pickupCity.city_name,
			dropoff_city_id: dropoffCity.city_id,
			dropoff_city_name: dropoffCity.city_name,
			same_city: isSameArea,
		};

		return {
			bookingType: isSameArea ? BookingType.RIDE_HAILING : BookingType.RENTAL,
			detectedCities,
		};
	}

	/**
	 * Check car availability for a booking
	 * For RENTAL: Check date range overlaps
	 * For RIDE_HAILING: Check driver mode and active bookings
	 */
	private async checkCarAvailability(
		carId: number,
		bookingType: BookingType,
		startDate?: Date,
		endDate?: Date,
	): Promise<{ available: boolean; reason?: string }> {
		const car = await this.prisma.car.findUnique({
			where: { id: carId },
			include: {
				driver: true,
				carBookings: {
					where: {
						status: {
							in: ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'],
						},
					},
				},
			},
		});

		if (!car) {
			return { available: false, reason: 'Car not found' };
		}

		if (bookingType === BookingType.RENTAL) {
			// Check availability flags
			if (!car.available_for_rental) {
				return { available: false, reason: 'Car is not available for rental' };
			}

			// Check for date overlaps with existing RENTAL bookings
			if (startDate && endDate) {
				const conflictingBookings = car.carBookings.filter(booking => {
					if (booking.booking_type !== BookingType.RENTAL) return false;
					if (!booking.start_date || !booking.end_date) return false;
					return booking.start_date <= endDate && booking.end_date >= startDate;
				});

				if (conflictingBookings.length > 0) {
					return { available: false, reason: 'Car is not available for the selected dates' };
				}
			}
		} else if (bookingType === BookingType.RIDE_HAILING) {
			// Check availability flags
			if (!car.available_for_ride_hailing) {
				return { available: false, reason: 'Car is not available for ride-hailing' };
			}

			// Check driver mode
			if (car.current_mode !== 'ride_hailing') {
				return { available: false, reason: 'Driver is not currently accepting ride-hailing requests' };
			}

			// Check for active IN_PROGRESS ride-hailing booking
			const activeRide = car.carBookings.find(
				booking => booking.booking_type === BookingType.RIDE_HAILING && booking.status === 'IN_PROGRESS'
			);

			if (activeRide) {
				return { available: false, reason: 'Driver currently has an active ride in progress' };
			}

			// Check for any active RENTAL booking
			const activeRental = car.carBookings.find(booking => booking.booking_type === BookingType.RENTAL);

			if (activeRental) {
				return { available: false, reason: 'Car has an active rental booking' };
			}
		}

		return { available: true };
	}

	/**
	 * Get chat messages for a booking
	 */
	async getChatMessages(bookingId: number, userId: number) {
		const booking = await this.prisma.carBooking.findUnique({
			where: { id: bookingId },
			include: {
				car: {
					include: {
						driver: true,
					},
				},
			},
		});

		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		// Check if user is authorized to view chat
		const isCustomer = booking.user_id === userId;
		const isDriver = booking.car.driver.user_id === userId;

		if (!isCustomer && !isDriver) {
			throw new BadRequestException('You are not authorized to view this chat');
		}

		const chat = await this.prisma.chat.findUnique({
			where: { booking_id: bookingId },
			include: {
				messages: {
					include: {
						sender: {
							select: {
								id: true,
								full_name: true,
							},
						},
					},
					orderBy: { sent_at: 'asc' },
				},
			},
		});

		if (!chat) {
			return { messages: [] };
		}

		return {
			chat_id: chat.id,
			messages: chat.messages.map((message) => ({
				id: message.id,
				sender: {
					id: message.sender.id.toString(),
					name: message.sender.full_name,
				},
				message: message.message,
				sent_at: message.sent_at.toISOString(),
				read_at: message.read_at?.toISOString(),
			})),
		};
	}

	/**
	 * Send message in chat
	 */
	async sendMessage(bookingId: number, senderId: number, message: string) {
		const booking = await this.prisma.carBooking.findUnique({
			where: { id: bookingId },
			include: {
				car: {
					include: {
						driver: true,
					},
				},
			},
		});

		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		// Check if user is authorized to send messages
		const isCustomer = booking.user_id === senderId;
		const isDriver = booking.car.driver.user_id === senderId;

		if (!isCustomer && !isDriver) {
			throw new BadRequestException('You are not authorized to send messages in this chat');
		}

		// Get or create chat
		let chat = await this.prisma.chat.findUnique({
			where: { booking_id: bookingId },
		});

		if (!chat) {
			chat = await this.prisma.chat.create({
				data: {
					booking_id: bookingId,
				},
			});
		}

		// Create message
		const newMessage = await this.prisma.chatMessage.create({
			data: {
				chat_id: chat.id,
				sender_id: senderId,
				message,
			},
			include: {
				sender: {
					select: {
						id: true,
						full_name: true,
					},
				},
			},
		});

		const messageData = {
			id: newMessage.id,
			sender: {
				id: newMessage.sender.id.toString(),
				name: newMessage.sender.full_name,
			},
			message: newMessage.message,
			sent_at: newMessage.sent_at.toISOString(),
		};

		// Determine recipient and create notification
		const recipientId = isCustomer 
			? booking.car.driver.user_id 
			: booking.user_id;

		// Create notification for recipient (only if they're not the sender)
		if (recipientId !== senderId) {
			const messagePreview = message.length > 50 
				? `${message.substring(0, 50)}...` 
				: message;

			await this.notificationsService.createNotification(
				recipientId,
				'chat_message',
				'New Chat Message',
				`${newMessage.sender.full_name} sent you a message: ${messagePreview}`,
				{
					booking_id: bookingId,
					booking_type: 'car',
					message_id: newMessage.id,
					sender_id: senderId,
					sender_name: newMessage.sender.full_name,
				}
			);
		}

		// Emit real-time message via WebSocket
		if (this.chatGateway) {
			this.chatGateway.emitNewMessage(bookingId, messageData);
		}

		return messageData;
	}

	/**
	 * Mark all unread messages in a chat as read
	 */
	async markMessagesAsRead(bookingId: number, userId: number) {
		const booking = await this.prisma.carBooking.findUnique({
			where: { id: bookingId },
			include: {
				car: {
					include: {
						driver: true,
					},
				},
			},
		});

		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		// Check if user is authorized to view chat
		const isCustomer = booking.user_id === userId;
		const isDriver = booking.car.driver.user_id === userId;

		if (!isCustomer && !isDriver) {
			throw new BadRequestException('You are not authorized to view this chat');
		}

		// Get chat
		const chat = await this.prisma.chat.findUnique({
			where: { booking_id: bookingId },
		});

		if (!chat) {
			return { message: 'No chat found', marked_count: 0 };
		}

		// Mark all messages sent by the other user (not by current user) as read
		const otherUserId = isCustomer ? booking.car.driver.user_id : booking.user_id;

		const result = await this.prisma.chatMessage.updateMany({
			where: {
				chat_id: chat.id,
				sender_id: otherUserId, // Only mark messages from the other user
				read_at: null, // Only mark unread messages
			},
			data: {
				read_at: new Date(),
			},
		});

		return {
			message: 'Messages marked as read',
			marked_count: result.count,
		};
	}

	// =====================
	// DRIVER CAR MANAGEMENT
	// =====================

	/**
	 * Get driver's cars
	 */
	async getDriverCars(driverId: number) {
		const driver = await this.prisma.driver.findFirst({
			where: { user_id: driverId },
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		const cars = await this.prisma.car.findMany({
			where: { driver_id: driver.id },
			include: {
				carModel: true,
				images: {
					orderBy: { display_order: 'asc' },
				},
				carBookings: {
					select: {
						id: true,
						status: true,
						total_amount: true,
						driver_earnings: true,
					},
				},
			},
			orderBy: { created_at: 'desc' },
		});

		const formattedCars = cars.map((car) => {
			const totalBookings = car.carBookings.length;
			const activeBookings = car.carBookings.filter(
				(booking) => ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'].includes(booking.status)
			).length;
			const totalEarnings = car.carBookings
				.filter((booking) => ['COMPLETED'].includes(booking.status))
				.reduce((sum, booking) => sum + parseFloat(booking.driver_earnings.toString()), 0);

			return {
				id: car.id.toString(),
				car: {
					make: car.carModel.make,
					model: car.carModel.model,
					year: car.year,
					seats: car.seats,
					transmission: car.transmission,
					fuel_type: car.fuel_type,
					color: car.color,
					license_plate: car.license_plate,
				},
				pricing: {
					base_price_per_day: parseFloat(car.base_price_per_day.toString()),
					distance_rate_per_km: parseFloat(car.distance_rate_per_km.toString()),
					// Ride-hailing pricing
					base_fare: car.base_fare ? parseFloat(car.base_fare.toString()) : null,
					per_km_rate: car.per_km_rate ? parseFloat(car.per_km_rate.toString()) : null,
					per_minute_rate: car.per_minute_rate ? parseFloat(car.per_minute_rate.toString()) : null,
					minimum_fare: car.minimum_fare ? parseFloat(car.minimum_fare.toString()) : null,
				},
				availability: {
					available_for_rental: car.available_for_rental,
					available_for_ride_hailing: car.available_for_ride_hailing,
				},
				images: car.images.map((img) => img.image_url),
				is_active: car.is_active,
				is_listed: car.is_listed,
				booking_stats: {
					total_bookings: totalBookings,
					active_bookings: activeBookings,
					total_earnings: totalEarnings,
				},
				created_at: car.created_at.toISOString(),
			};
		});

		return {
			data: formattedCars,
			driver: {
				id: driver.id.toString(),
				is_verified: driver.is_verified,
			},
		};
	}

	/**
	 * Add new car (Driver)
	 */
	async addDriverCar(driverId: number, data: any) {
		const driver = await this.prisma.driver.findFirst({
			where: { user_id: driverId },
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		if (!driver.is_verified) {
			throw new BadRequestException('Driver must be verified to add cars');
		}

		// Validate make and model are provided
		if (!data.make || !data.model) {
			throw new BadRequestException('Car make and model are required');
		}

		// Find or create car model
		let carModel = await this.prisma.carModel.findFirst({
			where: {
				make: data.make,
				model: data.model,
			},
		});

		if (!carModel) {
			// Create new car model if it doesn't exist
			carModel = await this.prisma.carModel.create({
				data: {
					make: data.make,
					model: data.model,
				},
			});
		}

		// Validate required fields
		if (data.seats < 2 || data.seats > 8) {
			throw new BadRequestException('Seats must be between 2 and 8');
		}

		// Validate availability modes
		const availableForRental = data.available_for_rental ?? true;
		const availableForRideHailing = data.available_for_ride_hailing ?? false;

		if (!availableForRental && !availableForRideHailing) {
			throw new BadRequestException('At least one availability mode must be enabled');
		}

		// Validate rental pricing if rental mode is enabled
		if (availableForRental) {
			if (data.base_price_per_day <= 0) {
				throw new BadRequestException('Base price must be positive when rental mode is enabled');
			}
			if (data.distance_rate_per_km < 0) {
				throw new BadRequestException('Distance rate cannot be negative');
			}
		}

		// Validate ride-hailing pricing if ride-hailing mode is enabled
		if (availableForRideHailing) {
			if (!data.base_fare || data.base_fare <= 0) {
				throw new BadRequestException('Base fare must be positive when ride-hailing mode is enabled');
			}
			if (!data.per_km_rate || data.per_km_rate <= 0) {
				throw new BadRequestException('Per KM rate must be positive when ride-hailing mode is enabled');
			}
			if (data.per_minute_rate === undefined || data.per_minute_rate < 0) {
				throw new BadRequestException('Per minute rate cannot be negative');
			}
			if (!data.minimum_fare || data.minimum_fare <= 0) {
				throw new BadRequestException('Minimum fare must be positive when ride-hailing mode is enabled');
			}
		}

		const currentYear = new Date().getFullYear();
		if (data.year < 2000 || data.year > currentYear) {
			throw new BadRequestException(`Year must be between 2000 and ${currentYear}`);
		}

		// Check license plate uniqueness if provided
		if (data.license_plate) {
			const existingCar = await this.prisma.car.findFirst({
				where: { license_plate: data.license_plate },
			});

			if (existingCar) {
				throw new BadRequestException('License plate already exists');
			}
		}

		// Create car with images in transaction
		const car = await this.prisma.$transaction(async (tx) => {
			const newCar = await tx.car.create({
				data: {
					driver_id: driver.id,
					car_model_id: carModel.id,
					seats: data.seats,
					base_price_per_day: data.base_price_per_day || 0,
					distance_rate_per_km: data.distance_rate_per_km || 0,
					transmission: data.transmission,
					fuel_type: data.fuel_type,
					year: data.year,
					color: data.color,
					license_plate: data.license_plate,
					is_active: true, // Cars are active by default when created
					is_listed: true, // Cars are listed by default
					// Dual-mode availability
					available_for_rental: availableForRental,
					available_for_ride_hailing: availableForRideHailing,
					// Ride-hailing pricing
					base_fare: data.base_fare || null,
					per_km_rate: data.per_km_rate || null,
					per_minute_rate: data.per_minute_rate || null,
					minimum_fare: data.minimum_fare || null,
				},
			});

			// Create images if provided
			if (data.images?.length > 0) {
				await tx.carImage.createMany({
					data: data.images.map((url: string, index: number) => ({
						car_id: newCar.id,
						image_url: url,
						display_order: index,
					})),
				});
			}

			return newCar;
		});

		return {
			id: car.id.toString(),
			message: 'Car added successfully',
			car: {
				make: carModel.make,
				model: carModel.model,
				year: car.year,
				seats: car.seats,
			},
		};
	}

	/**
	 * Update car details (Driver)
	 */
	async updateDriverCar(driverId: number, carId: number, data: any) {
		const driver = await this.prisma.driver.findFirst({
			where: { user_id: driverId },
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		const car = await this.prisma.car.findFirst({
			where: { id: carId, driver_id: driver.id },
			include: {
				carBookings: {
					where: {
						status: {
							in: ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'],
						},
					},
				},
			},
		});

		if (!car) {
			throw new NotFoundException('Car not found or you do not own this car');
		}

		// Check if car has active bookings
		if (car.carBookings.length > 0) {
			throw new BadRequestException('Cannot update car with active bookings');
		}

		// Validate fields if being updated
		if (data.seats !== undefined && (data.seats < 2 || data.seats > 8)) {
			throw new BadRequestException('Seats must be between 2 and 8');
		}

		// Validate availability modes
		const availableForRental = data.available_for_rental ?? car.available_for_rental;
		const availableForRideHailing = data.available_for_ride_hailing ?? car.available_for_ride_hailing;

		if (!availableForRental && !availableForRideHailing) {
			throw new BadRequestException('At least one availability mode must be enabled');
		}

		// Validate rental pricing if rental mode is enabled
		if (availableForRental) {
			const basePricePerDay = data.base_price_per_day ?? car.base_price_per_day;
			if (basePricePerDay <= 0) {
				throw new BadRequestException('Base price must be positive when rental mode is enabled');
			}

			const distanceRate = data.distance_rate_per_km ?? car.distance_rate_per_km;
			if (distanceRate < 0) {
				throw new BadRequestException('Distance rate cannot be negative');
			}
		}

		// Validate ride-hailing pricing if ride-hailing mode is enabled
		if (availableForRideHailing) {
			const baseFare = data.base_fare ?? car.base_fare;
			if (!baseFare || baseFare <= 0) {
				throw new BadRequestException('Base fare must be positive when ride-hailing mode is enabled');
			}

			const perKmRate = data.per_km_rate ?? car.per_km_rate;
			if (!perKmRate || perKmRate <= 0) {
				throw new BadRequestException('Per KM rate must be positive when ride-hailing mode is enabled');
			}

			const perMinuteRate = data.per_minute_rate ?? car.per_minute_rate;
			if (perMinuteRate === undefined || perMinuteRate < 0) {
				throw new BadRequestException('Per minute rate cannot be negative');
			}

			const minimumFare = data.minimum_fare ?? car.minimum_fare;
			if (!minimumFare || minimumFare <= 0) {
				throw new BadRequestException('Minimum fare must be positive when ride-hailing mode is enabled');
			}
		}

		if (data.year !== undefined) {
			const currentYear = new Date().getFullYear();
			if (data.year < 2000 || data.year > currentYear) {
				throw new BadRequestException(`Year must be between 2000 and ${currentYear}`);
			}
		}

		// Check license plate uniqueness if being updated
		if (data.license_plate && data.license_plate !== car.license_plate) {
			const existingCar = await this.prisma.car.findFirst({
				where: { 
					license_plate: data.license_plate,
					id: { not: carId },
				},
			});

			if (existingCar) {
				throw new BadRequestException('License plate already exists');
			}
		}

		// Handle make/model update - find or create car model
		let carModelId = car.car_model_id;
		if (data.make && data.model) {
			let carModel = await this.prisma.carModel.findFirst({
				where: {
					make: data.make,
					model: data.model,
				},
			});

			if (!carModel) {
				carModel = await this.prisma.carModel.create({
					data: {
						make: data.make,
						model: data.model,
					},
				});
			}
			carModelId = carModel.id;
		}

		const updatedCar = await this.prisma.car.update({
			where: { id: carId },
			data: {
				car_model_id: carModelId,
				seats: data.seats,
				base_price_per_day: data.base_price_per_day,
				distance_rate_per_km: data.distance_rate_per_km,
				transmission: data.transmission,
				fuel_type: data.fuel_type,
				year: data.year,
				color: data.color,
				license_plate: data.license_plate,
				is_active: data.is_active,
				// Dual-mode availability
				available_for_rental: data.available_for_rental,
				available_for_ride_hailing: data.available_for_ride_hailing,
				// Ride-hailing pricing
				base_fare: data.base_fare,
				per_km_rate: data.per_km_rate,
				per_minute_rate: data.per_minute_rate,
				minimum_fare: data.minimum_fare,
			},
		});

		return {
			id: updatedCar.id.toString(),
			message: 'Car updated successfully',
		};
	}

	// =====================
	// ADMIN CAR MANAGEMENT
	// =====================

	/**
	 * Get all cars (Admin)
	 */
	async getAllCarsForAdmin(query: any = {}) {
		const {
			page = 1,
			limit = 20,
			city_id,
			is_verified,
			driver_id,
			is_active,
		} = query;

		// Build WHERE conditions
		const where: any = {};

		if (city_id) {
			where.driver = {
				user: {
					city_id: parseInt(city_id),
				},
			};
		}

		if (is_verified !== undefined) {
			where.driver = {
				...where.driver,
				is_verified: is_verified === 'true',
			};
		}

		if (driver_id) {
			where.driver = {
				...where.driver,
				user_id: parseInt(driver_id),
			};
		}

		if (is_active !== undefined) {
			where.is_active = is_active === 'true';
		}

		const [cars, total] = await Promise.all([
			this.prisma.car.findMany({
				where,
				include: {
					driver: {
						include: {
							user: {
								select: {
									id: true,
									full_name: true,
									email: true,
									city: {
										select: {
											id: true,
											name: true,
										},
									},
								},
							},
						},
					},
					carModel: true,
					carBookings: {
						select: {
							id: true,
							status: true,
						},
					},
				},
				orderBy: { created_at: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
			}),
			this.prisma.car.count({ where }),
		]);

		const formattedCars = cars.map((car) => ({
			id: car.id.toString(),
			driver: {
				id: car.driver.user.id.toString(),
				name: car.driver.user.full_name,
				email: car.driver.user.email,
				city: car.driver.user.city.name,
				is_verified: car.driver.is_verified,
			},
			car: {
				make: car.carModel.make,
				model: car.carModel.model,
				year: car.year,
				seats: car.seats,
				transmission: car.transmission,
				fuel_type: car.fuel_type,
				color: car.color,
				license_plate: car.license_plate,
			},
			pricing: {
				base_price_per_day: parseFloat(car.base_price_per_day.toString()),
				distance_rate_per_km: parseFloat(car.distance_rate_per_km.toString()),
			},
			is_active: car.is_active,
			booking_count: car.carBookings.length,
			created_at: car.created_at.toISOString(),
		}));

		return {
			data: formattedCars,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Verify driver (Admin)
	 */
	async verifyDriverForAdmin(driverId: number, data: { is_verified: boolean; verification_notes?: string }) {
		const driver = await this.prisma.driver.findUnique({
			where: { id: driverId },
			include: {
				user: {
					select: {
						id: true,
						full_name: true,
						email: true,
					},
				},
				documents: true,
				ratings: true,
			},
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		// Check if driver has submitted documents
		if (driver.documents.length === 0) {
			throw new BadRequestException('Driver has not submitted verification documents');
		}

		// Check if driver has at least a license document
		const hasLicense = driver.documents.some((doc) => doc.document_type === 'license');
		if (!hasLicense) {
			throw new BadRequestException('Driver must submit a license document');
		}

		// Update driver verification status
		const updatedDriver = await this.prisma.driver.update({
			where: { id: driverId },
			data: {
				is_verified: data.is_verified,
				verification_notes: data.verification_notes,
				verified_at: data.is_verified ? new Date() : null,
			},
			include: {
				user: {
					select: {
						id: true,
						full_name: true,
						email: true,
					},
				},
			},
		});

		// If verifying, approve all pending documents and ratings
		if (data.is_verified) {
			await this.prisma.driverDocument.updateMany({
				where: {
					driver_id: driverId,
					status: 'pending',
				},
				data: {
					status: 'approved',
					reviewed_at: new Date(),
				},
			});

			await this.prisma.driverRating.updateMany({
				where: {
					driver_id: driverId,
					verified_at: null,
				},
				data: {
					verified_at: new Date(),
				},
			});
		}

		return {
			message: data.is_verified ? 'Driver verified successfully' : 'Driver verification rejected',
			driver: {
				id: updatedDriver.id.toString(),
				user: {
					id: updatedDriver.user.id.toString(),
					name: updatedDriver.user.full_name,
					email: updatedDriver.user.email,
				},
				is_verified: updatedDriver.is_verified,
				verification_notes: updatedDriver.verification_notes,
				verified_at: updatedDriver.verified_at?.toISOString(),
			},
		};
	}

	/**
	 * Upload and add images to car using Cloudinary
	 */
	async uploadCarImages(carId: number, files: any[]) {
		const car = await this.prisma.car.findUnique({ 
			where: { id: carId },
			include: { driver: true }
		});

		if (!car) {
			throw new NotFoundException('Car not found');
		}

		if (!files || files.length === 0) {
			throw new BadRequestException('No files uploaded');
		}

		try {
			// Upload to Cloudinary
			const uploadResults = await this.cloudinaryService.uploadMultipleImages(
				files,
				'cars',
				{
					transformation: [
						{ width: 1200, height: 800, crop: 'fill', quality: 'auto' },
						{ fetch_format: 'auto' }
					]
				}
			);

			// Get current max order
			const maxOrder = await this.prisma.carImage.findFirst({
				where: { car_id: carId },
				orderBy: { display_order: 'desc' },
			});

			const startOrder = (maxOrder?.display_order || -1) + 1;

			// Save to database
			await this.prisma.carImage.createMany({
				data: uploadResults.map((result: any, index: number) => ({
					car_id: carId,
					image_url: result.secure_url,
					public_id: result.public_id,
					display_order: startOrder + index,
				})),
			});

			return {
				message: `${files.length} image(s) uploaded successfully`,
				images: uploadResults.map((result: any) => ({
					url: result.secure_url,
					public_id: result.public_id,
				})),
			};
		} catch (error) {
			console.error('Upload error:', error);
			throw new BadRequestException('Failed to upload images');
		}
	}

	/**
	 * Delete car image from Cloudinary and database
	 */
	async removeCarImageWithCloudinary(carId: number, imageId: number) {
		const image = await this.prisma.carImage.findFirst({
			where: { id: imageId, car_id: carId },
		}) as any;

		if (!image) {
			throw new NotFoundException('Image not found');
		}

		try {
			// Delete from Cloudinary if public_id exists
			if (image.public_id) {
				await this.cloudinaryService.deleteImage(image.public_id);
			}
			
			// Delete from database
			await this.prisma.carImage.delete({
				where: { id: imageId },
			});

			return { message: 'Image deleted successfully' };
		} catch (error) {
			console.error('Delete error:', error);
			throw new BadRequestException('Failed to delete image');
		}
	}

	/**
	 * Get optimized image URLs for different sizes
	 */
	async getOptimizedCarImages(carId: number) {
		const images = await this.prisma.carImage.findMany({
			where: { car_id: carId },
			orderBy: { display_order: 'asc' },
		}) as any[];

		return images.map(image => ({
			id: image.id,
			original: image.image_url,
			responsive: image.public_id ? 
				this.cloudinaryService.generateResponsiveUrls(image.public_id) : 
				{
					thumbnail: image.image_url,
					medium: image.image_url,
					large: image.image_url,
					original: image.image_url
				}
		}));
	}

	/**
	 * Get all car models
	 */
	async getAllCarModels() {
		const carModels = await this.prisma.carModel.findMany({
			orderBy: [
				{ make: 'asc' },
				{ model: 'asc' },
			],
		});

		return carModels.map(model => ({
			id: model.id,
			make: model.make,
			model: model.model,
			displayName: `${model.make} ${model.model}`,
		}));
	}

	/**
	 * Update car availability/listing status
	 */
	async updateCarAvailability(carId: number, driverUserId: number, data: { is_listed?: boolean }) {
		const car = await this.prisma.car.findUnique({
			where: { id: carId },
			include: {
				driver: {
					select: {
						id: true,
						user_id: true,
						is_verified: true,
					},
				},
			},
		});

		if (!car) {
			throw new NotFoundException('Car not found');
		}

		if (car.driver.user_id !== driverUserId) {
			throw new ForbiddenException('You can only update your own cars');
		}

		if (!car.driver.is_verified) {
			throw new ForbiddenException('Driver must be verified to list cars');
		}

		const updated = await this.prisma.car.update({
			where: { id: carId },
			data: {
				is_listed: data.is_listed !== undefined ? data.is_listed : car.is_listed,
			},
		});

		return {
			id: updated.id,
			is_listed: updated.is_listed,
			message: 'Car availability updated successfully',
		};
	}

	// =====================
	// CITY EXPLORER
	// =====================

	/**
	 * Get popular cities with most available verified drivers
	 */
	async getPopularCities() {
		const driversWithCities = await this.prisma.driver.findMany({
			where: {
				is_verified: true,
				user: { status: 'active' },
			},
			select: {
				user: {
					select: {
						city: {
							select: { name: true, region: true },
						},
					},
				},
			},
		});

		const cityMap = new Map<string, { city: string; region: string; available_drivers: number }>();
		for (const driver of driversWithCities) {
			const cityName = driver.user.city.name;
			const region = driver.user.city.region;
			if (!cityMap.has(cityName)) {
				cityMap.set(cityName, { city: cityName, region, available_drivers: 0 });
			}
			cityMap.get(cityName)!.available_drivers++;
		}

		return Array.from(cityMap.values())
			.sort((a, b) => b.available_drivers - a.available_drivers)
			.slice(0, 8);
	}

	/**
	 * Get city explorer data: weather, places, restaurants, wikipedia facts
	 */
	async getCityExplorerData(cityName: string) {
		const [weatherResult, placesResult, wikiResult] = await Promise.allSettled([
			this.getWeatherForCity(cityName),
			this.getPlacesForCity(cityName),
			this.getWikipediaData(cityName),
		]);

		const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
		const places = placesResult.status === 'fulfilled' ? placesResult.value : { places: [], restaurants: [] };
		const wiki = wikiResult.status === 'fulfilled' ? wikiResult.value : null;

		return {
			city: cityName,
			weather,
			places_to_visit: places.places,
			restaurants: places.restaurants,
			facts: wiki?.summary || '',
			wiki_url: wiki?.url || '',
			thumbnail: wiki?.thumbnail || null,
			best_time_to_visit: weather ? this.getBestTimeToVisit(weather.temperature) : 'Check weather for recommendations',
		};
	}

	private async getWeatherForCity(cityName: string) {
		try {
			return await this.weatherService.getCurrentWeather(cityName);
		} catch (error) {
			this.logger.warn(`Failed to get weather for ${cityName}: ${error}`);
			return null;
		}
	}

	private async getPlacesForCity(cityName: string) {
		const apiKey = this.configService.get('GOOGLE_PLACES_API_KEY');
		if (!apiKey) {
			return { places: [], restaurants: [] };
		}

		try {
			const [placesRes, restaurantsRes] = await Promise.allSettled([
				axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
					params: { query: `tourist attractions in ${cityName}`, key: apiKey },
					timeout: 10000,
				}),
				axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
					params: { query: `best restaurants in ${cityName}`, key: apiKey },
					timeout: 10000,
				}),
			]);

			const places = placesRes.status === 'fulfilled'
				? placesRes.value.data.results.slice(0, 5).map((place: any) => ({
						name: place.name,
						address: place.formatted_address,
						rating: place.rating || 0,
						photo: place.photos?.[0]
							? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
							: null,
					}))
				: [];

			const restaurants = restaurantsRes.status === 'fulfilled'
				? restaurantsRes.value.data.results.slice(0, 5).map((place: any) => ({
						name: place.name,
						address: place.formatted_address,
						rating: place.rating || 0,
						photo: place.photos?.[0]
							? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
							: null,
					}))
				: [];

			return { places, restaurants };
		} catch (error) {
			this.logger.warn(`Failed to get places for ${cityName}: ${error}`);
			return { places: [], restaurants: [] };
		}
	}

	private async getWikipediaData(cityName: string) {
		// Wikipedia requires a descriptive User-Agent header or it returns 403
		const wikiHeaders = {
			'User-Agent': 'TripVerse/1.0 (https://tripverse.app; contact@tripverse.app) axios/1.x',
		};

		// Strategy 1: Wikipedia REST API v1 (fast, structured)
		const searchVariants = [
			cityName,
			`${cityName}, Pakistan`,
			`${cityName} (city)`,
		];

		for (const variant of searchVariants) {
			try {
				const response = await axios.get(
					`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(variant)}`,
					{ timeout: 8000, headers: wikiHeaders },
				);

				if (response.data.type === 'disambiguation' || !response.data.extract) {
					this.logger.debug(`REST API: skipping "${variant}" (type=${response.data.type}, hasExtract=${!!response.data.extract})`);
					continue;
				}

				return {
					summary: response.data.extract,
					thumbnail: response.data.thumbnail?.source || null,
					url: response.data.content_urls?.desktop?.page || '',
				};
			} catch (err: any) {
				this.logger.warn(`REST API failed for "${variant}": ${err?.message || err} (code=${err?.code}, status=${err?.response?.status})`);
				continue;
			}
		}

		// Strategy 2: MediaWiki action=query API (more reliable fallback)
		const mwVariants = [cityName, `${cityName}, Pakistan`];
		for (const variant of mwVariants) {
			try {
				const response = await axios.get('https://en.wikipedia.org/w/api.php', {
					params: {
						action: 'query',
						titles: variant,
						prop: 'extracts|pageimages|info',
						exintro: true,
						explaintext: true,
						piprop: 'thumbnail',
						pithumbsize: 400,
						inprop: 'url',
						redirects: 1,
						format: 'json',
					},
					headers: wikiHeaders,
					timeout: 8000,
				});

				const pages = response.data?.query?.pages;
				if (!pages) {
					this.logger.warn(`MediaWiki API: no pages in response for "${variant}"`);
					continue;
				}

				const page = Object.values(pages)[0] as any;
				if (!page || page.pageid === -1 || !page.extract) {
					this.logger.warn(`MediaWiki API: page not found or no extract for "${variant}" (pageid=${page?.pageid})`);
					continue;
				}

				return {
					summary: page.extract,
					thumbnail: page.thumbnail?.source || null,
					url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title || variant)}`,
				};
			} catch (err: any) {
				this.logger.warn(`MediaWiki API failed for "${variant}": ${err?.message || err} (code=${err?.code}, status=${err?.response?.status})`);
				continue;
			}
		}

		this.logger.warn(`No Wikipedia data found for ${cityName} after all strategies`);
		return { summary: '', thumbnail: null, url: '' };
	}

	private getBestTimeToVisit(temperature: number): string {
		if (temperature < 15) return 'Winter season — pack warm clothes';
		if (temperature < 25) return 'Pleasant weather — ideal for exploring';
		if (temperature < 35) return 'Warm weather — stay hydrated';
		return 'Hot season — plan outdoor activities for mornings/evenings';
	}

	// =====================
	// Driver Mode Management
	// =====================

	/**
	 * Switch driver's operating mode (offline/ride_hailing/rental)
	 * Updates all of the driver's cars with the new mode
	 * 
	 * Validations:
	 * - Cannot switch to ride_hailing if any active rental exists
	 * - Cannot switch to rental if ride_hailing mode is active with pending rides
	 */
	async switchDriverMode(driverId: number, mode: 'offline' | 'ride_hailing' | 'rental'): Promise<{
		success: boolean;
		mode: string;
		updated_cars: number;
		message: string;
	}> {
		// Get driver and their cars
		const driver = await this.prisma.driver.findUnique({
			where: { id: driverId },
			include: {
				cars: {
					include: {
						carBookings: {
							where: {
								status: {
									in: ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'],
								},
							},
						},
					},
				},
			},
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		if (!driver.is_verified) {
			throw new ForbiddenException('Driver must be verified to switch modes');
		}

		// Validation checks
		if (mode === 'ride_hailing') {
			// Check for any active RENTAL bookings (not cancelled/completed)
			const activeRentals = driver.cars.flatMap(car => 
				car.carBookings.filter(b => b.booking_type === BookingType.RENTAL)
			);

			if (activeRentals.length > 0) {
				// Find the next upcoming or active rental
				const now = new Date();
				const conflictingRentals = activeRentals.filter(b => {
					const endDate = b.end_date ? new Date(b.end_date) : null;
					return !endDate || endDate >= now;
				});

				if (conflictingRentals.length > 0) {
					const nextRental = conflictingRentals[0];
					const startDate = nextRental.start_date ? new Date(nextRental.start_date).toLocaleDateString() : 'N/A';
					const endDate = nextRental.end_date ? new Date(nextRental.end_date).toLocaleDateString() : 'N/A';
					
					throw new BadRequestException(
						`Cannot switch to ride-hailing mode: You have ${conflictingRentals.length} active/upcoming rental booking(s). ` +
						`Next rental: ${startDate} - ${endDate}. Complete or cancel them first.`
					);
				}
			}

			// Check that at least one car is enabled for ride-hailing
			const rideHailingCars = driver.cars.filter(car => car.available_for_ride_hailing && car.is_active);
			if (rideHailingCars.length === 0) {
				throw new BadRequestException(
					'Cannot switch to ride-hailing mode: No cars are configured for ride-hailing. ' +
					'Enable ride-hailing on at least one car first.'
				);
			}
		}

		if (mode === 'rental') {
			// Check for any IN_PROGRESS ride-hailing bookings
			const activeRides = driver.cars.flatMap(car =>
				car.carBookings.filter(b => 
					b.booking_type === BookingType.RIDE_HAILING && b.status === 'IN_PROGRESS'
				)
			);

			if (activeRides.length > 0) {
				throw new BadRequestException(
					'Cannot switch to rental mode: You have an active ride in progress. ' +
					'Complete it first.'
				);
			}
		}

		// Update all of driver's active cars with the new mode
		const updatedCars = await this.prisma.car.updateMany({
			where: {
				driver_id: driverId,
				is_active: true,
			},
			data: {
				current_mode: mode,
			},
		});

		// Log the mode switch
		this.logger.log(`Driver ${driverId} switched to ${mode} mode (${updatedCars.count} cars updated)`);

		const modeMessages = {
			offline: 'You are now offline and not accepting any bookings.',
			ride_hailing: 'You are now accepting ride-hailing requests within your city.',
			rental: 'You are now accepting rental booking requests.',
		};

		return {
			success: true,
			mode,
			updated_cars: updatedCars.count,
			message: modeMessages[mode],
		};
	}

	/**
	 * Get driver's current mode
	 */
	async getDriverMode(driverId: number): Promise<{
		mode: string;
		cars: Array<{
			id: number;
			make: string;
			model: string;
			current_mode: string;
			available_for_rental: boolean;
			available_for_ride_hailing: boolean;
		}>;
	}> {
		const driver = await this.prisma.driver.findUnique({
			where: { id: driverId },
			include: {
				cars: {
					where: { is_active: true },
					include: {
						carModel: true,
					},
				},
			},
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		// Determine overall mode from first car (all should be same)
		const currentMode = driver.cars[0]?.current_mode || 'offline';

		return {
			mode: currentMode,
			cars: driver.cars.map(car => ({
				id: car.id,
				make: car.carModel.make,
				model: car.carModel.model,
				current_mode: car.current_mode || 'offline',
				available_for_rental: car.available_for_rental,
				available_for_ride_hailing: car.available_for_ride_hailing,
			})),
		};
	}

	/**
	 * Enable/disable a car for ride-hailing mode
	 */
	async updateCarRideHailingSettings(
		carId: number,
		driverId: number,
		settings: {
			available_for_ride_hailing?: boolean;
			base_fare?: number;
			per_km_rate?: number;
			per_minute_rate?: number;
			minimum_fare?: number;
		},
	): Promise<any> {
		const car = await this.prisma.car.findUnique({
			where: { id: carId },
			include: { driver: true },
		});

		if (!car) {
			throw new NotFoundException('Car not found');
		}

		if (car.driver_id !== driverId) {
			throw new ForbiddenException('You can only update your own cars');
		}

		const updatedCar = await this.prisma.car.update({
			where: { id: carId },
			data: {
				...(settings.available_for_ride_hailing !== undefined && {
					available_for_ride_hailing: settings.available_for_ride_hailing,
				}),
				...(settings.base_fare !== undefined && { base_fare: settings.base_fare }),
				...(settings.per_km_rate !== undefined && { per_km_rate: settings.per_km_rate }),
				...(settings.per_minute_rate !== undefined && { per_minute_rate: settings.per_minute_rate }),
				...(settings.minimum_fare !== undefined && { minimum_fare: settings.minimum_fare }),
			},
			include: {
				carModel: true,
			},
		});

		return {
			id: updatedCar.id,
			make: updatedCar.carModel.make,
			model: updatedCar.carModel.model,
			available_for_ride_hailing: updatedCar.available_for_ride_hailing,
			base_fare: updatedCar.base_fare?.toString(),
			per_km_rate: updatedCar.per_km_rate?.toString(),
			per_minute_rate: updatedCar.per_minute_rate?.toString(),
			minimum_fare: updatedCar.minimum_fare?.toString(),
			message: settings.available_for_ride_hailing
				? 'Car is now available for ride-hailing'
				: 'Ride-hailing settings updated',
		};
	}
}