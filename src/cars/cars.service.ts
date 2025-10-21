import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';

@Injectable()
export class CarsService {
	constructor(
		private prisma: PrismaService,
		private cloudinaryService: CloudinaryService
	) {}

	/**
	 * Search available cars with filters
	 * Only shows cars from verified drivers
	 */
	async searchCars(query: any = {}) {
		const {
			city_id,
			start_date,
			end_date,
			seats,
			transmission,
			fuel_type,
			min_price,
			max_price,
			page = 1,
			limit = 20,
		} = query;

		// Parse dates
		const startDate = start_date ? new Date(start_date) : null;
		const endDate = end_date ? new Date(end_date) : null;

		// Build WHERE conditions
		const where: any = {
			is_active: true,
			driver: {
				is_verified: true, // Only verified drivers
				user: {
					status: 'active',
				},
			},
		};

		// Filter by city
		if (city_id) {
			where.driver = {
				...where.driver,
				user: {
					...where.driver.user,
					city_id: parseInt(city_id),
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
					where: {
						status: {
							in: ['PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'],
						},
						// Check for date conflicts
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
			orderBy: [
				{ base_price_per_day: 'asc' },
				{ created_at: 'desc' },
			],
			skip: (page - 1) * limit,
			take: limit,
		});

		// Filter out cars with conflicting bookings
		const filteredCars = availableCars.filter((car) => {
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
	async findOne(id: number) {
		const car = await this.prisma.car.findUnique({
			where: { id },
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
				},
			},
		});

		if (!car || !car.is_active) {
			throw new NotFoundException('Car not found');
		}

		if (!car.driver.is_verified) {
			throw new NotFoundException('Driver not verified');
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
			},
			images: car.images.map((img) => img.image_url),
			createdAt: car.created_at.toISOString(),
		};
	}

	/**
	 * Calculate price for a specific car and route
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
			// TODO: Integrate with Google Maps API to get actual distance
			// For now, we'll use a placeholder distance calculation
			distance = await this.estimateDistance(pickupLocation, dropoffLocation);
		}

		// Calculate pricing
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
	 * Create booking request
	 */
	async createBookingRequest(data: any) {
		const { car_id, user_id, pickup_location, dropoff_location, start_date, end_date, customer_notes } = data;

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
				start_date: new Date(start_date),
				end_date: new Date(end_date),
				status: 'PENDING_DRIVER_ACCEPTANCE',
				total_amount: priceCalculation.pricing_breakdown.total_amount,
				driver_earnings: priceCalculation.pricing_breakdown.driver_earnings,
				platform_fee: priceCalculation.pricing_breakdown.platform_fee,
				currency: 'usd',
				customer_notes,
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

		// TODO: Send notification to driver
		// await this.notifyDriver(booking.car.driver.user.id, {
		//   type: 'new_booking_request',
		//   booking_id: booking.id,
		//   customer_name: booking.user.full_name,
		//   trip_details: {
		//     pickup: pickup_location,
		//     dropoff: dropoff_location,
		//     start_date: start_date,
		//     end_date: end_date,
		//     total_earnings: booking.driver_earnings,
		//   },
		// });

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
	 * Driver responds to booking request
	 */
	async respondToBooking(bookingId: number, driverId: number, response: 'accept' | 'reject', driverNotes?: string) {
		const booking = await this.prisma.carBooking.findUnique({
			where: { id: bookingId },
			include: {
				car: {
					include: {
						driver: true,
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

		// TODO: Send notification to customer
		// if (response === 'accept') {
		//   await this.notifyCustomer(booking.user_id, {
		//     type: 'driver_accepted',
		//     booking_id: booking.id,
		//     driver_name: booking.car.driver.user.full_name,
		//     payment_amount: parseFloat(booking.total_amount.toString()),
		//   });
		// } else {
		//   await this.notifyCustomer(booking.user_id, {
		//     type: 'driver_rejected',
		//     booking_id: booking.id,
		//     message: 'Driver is not available for this trip.',
		//   });
		// }

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

		// Create payment transaction record
		const paymentTransaction = await this.prisma.paymentTransaction.create({
			data: {
				booking_car_id: bookingId,
				user_id: userId,
				amount: booking.total_amount,
				currency: booking.currency,
				application_fee_amount: booking.platform_fee,
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

		// Create chat for driver-customer communication
		await this.prisma.chat.create({
			data: {
				booking_id: bookingId,
			},
		});

		// TODO: Send confirmation notifications
		// await this.notifyCustomer(booking.user_id, {
		//   type: 'booking_confirmed',
		//   booking_id: booking.id,
		//   message: 'Your booking has been confirmed!',
		// });

		// await this.notifyDriver(booking.car.driver.user_id, {
		//   type: 'booking_confirmed',
		//   booking_id: booking.id,
		//   message: 'Booking confirmed! Payment received.',
		// });

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
			},
			driver: {
				name: booking.car.driver.user.full_name,
			},
			pickup_location: booking.pickup_location,
			dropoff_location: booking.dropoff_location,
			start_date: booking.start_date.toISOString().split('T')[0],
			end_date: booking.end_date.toISOString().split('T')[0],
			total_amount: parseFloat(booking.total_amount.toString()),
			created_at: booking.created_at.toISOString(),
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
			start_date: booking.start_date.toISOString().split('T')[0],
			end_date: booking.end_date.toISOString().split('T')[0],
			driver_earnings: parseFloat(booking.driver_earnings.toString()),
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
						driver: true,
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

		// TODO: Send notification to customer
		// await this.notifyCustomer(booking.user_id, {
		//   type: 'trip_started',
		//   booking_id: booking.id,
		//   message: 'Your trip has started!',
		// });

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

		// TODO: Send completion notifications
		// await this.notifyCustomer(booking.user_id, {
		//   type: 'trip_completed',
		//   booking_id: booking.id,
		//   message: 'Your trip has been completed successfully!',
		// });

		return {
			id: updatedBooking.id,
			status: updatedBooking.status,
			message: 'Trip completed successfully',
		};
	}

	/**
	 * Helper method to estimate distance (placeholder for Google Maps integration)
	 */
	private async estimateDistance(pickup: string, dropoff: string): Promise<number> {
		// TODO: Integrate with Google Maps Distance Matrix API
		// For now, return a placeholder distance
		return 100; // 100km placeholder
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

		return {
			id: newMessage.id,
			sender: {
				id: newMessage.sender.id.toString(),
				name: newMessage.sender.full_name,
			},
			message: newMessage.message,
			sent_at: newMessage.sent_at.toISOString(),
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
				},
				images: car.images.map((img) => img.image_url),
				is_active: car.is_active,
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

		// Validate car model exists
		const carModel = await this.prisma.carModel.findUnique({
			where: { id: data.car_model_id },
		});

		if (!carModel) {
			throw new NotFoundException('Car model not found');
		}

		// Validate required fields
		if (data.seats < 2 || data.seats > 8) {
			throw new BadRequestException('Seats must be between 2 and 8');
		}

		if (data.base_price_per_day <= 0) {
			throw new BadRequestException('Base price must be positive');
		}

		if (data.distance_rate_per_km < 0) {
			throw new BadRequestException('Distance rate cannot be negative');
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
					car_model_id: data.car_model_id,
					seats: data.seats,
					base_price_per_day: data.base_price_per_day,
					distance_rate_per_km: data.distance_rate_per_km,
					transmission: data.transmission,
					fuel_type: data.fuel_type,
					year: data.year,
					color: data.color,
					license_plate: data.license_plate,
					is_active: true,
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

		if (data.base_price_per_day !== undefined && data.base_price_per_day <= 0) {
			throw new BadRequestException('Base price must be positive');
		}

		if (data.distance_rate_per_km !== undefined && data.distance_rate_per_km < 0) {
			throw new BadRequestException('Distance rate cannot be negative');
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

		const updatedCar = await this.prisma.car.update({
			where: { id: carId },
			data: {
				seats: data.seats,
				base_price_per_day: data.base_price_per_day,
				distance_rate_per_km: data.distance_rate_per_km,
				transmission: data.transmission,
				fuel_type: data.fuel_type,
				year: data.year,
				color: data.color,
				license_plate: data.license_plate,
				is_active: data.is_active,
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

		if (!car || !car.is_active) {
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
}