import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { NotificationsService as CommonNotificationsService } from '../common/services/notifications.service';
import { HotelBookingStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingWithPaymentDto } from './dto/create-booking-with-payment.dto';

@Injectable()
export class BookingsService {
	constructor(
		@Inject(PrismaService) private prisma: PrismaService,
		private notificationsService: CommonNotificationsService,
	) {}

	/**
	 * Create hotel booking request with strict availability checking
	 */
	async createHotelBookingRequest(data: any) {
		const { hotel_id, room_type_id, user_id, quantity, check_in, check_out, guest_notes } = data;

		// Validate input dates
		const checkInDate = new Date(check_in + 'T00:00:00.000Z'); // Ensure UTC parsing
		const checkOutDate = new Date(check_out + 'T00:00:00.000Z'); // Ensure UTC parsing
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Debug logging
		console.log('Date validation:', {
			check_in: check_in,
			check_out: check_out,
			checkInDate: checkInDate.toISOString(),
			checkOutDate: checkOutDate.toISOString(),
			today: today.toISOString(),
			isCheckInValid: checkInDate >= today
		});

		if (checkInDate < today) {
			throw new BadRequestException(`Check-in date cannot be in the past. Check-in: ${checkInDate.toISOString().split('T')[0]}, Today: ${today.toISOString().split('T')[0]}`);
		}

		if (checkOutDate <= checkInDate) {
			throw new BadRequestException('Check-out date must be after check-in date');
		}

		if (quantity < 1 || quantity > 10) {
			throw new BadRequestException('Quantity must be between 1 and 10 rooms');
		}

		// Use transaction to ensure atomic availability check and booking creation
		const booking = await this.prisma.$transaction(async (tx) => {
			// 1. Validate hotel and room type exist
			const hotel = await tx.hotel.findUnique({
				where: { id: hotel_id },
				include: {
					city: { select: { id: true, name: true } },
					manager: {
						select: {
							id: true,
							is_verified: true,
						},
					},
					roomTypes: {
						where: { id: room_type_id, is_active: true },
					},
				},
			});

			if (!hotel || !hotel.is_active) {
				throw new NotFoundException('Hotel not found or inactive');
			}

			// Check if hotel manager is verified and hotel is listed
			if (!hotel.manager || !hotel.manager.is_verified) {
				throw new BadRequestException('Hotel manager is not verified. This hotel is not available for booking.');
			}

			if (!hotel.is_listed) {
				throw new BadRequestException('Hotel is not currently listed. This hotel is not available for booking.');
			}

			if (hotel.roomTypes.length === 0) {
				throw new NotFoundException('Room type not found or inactive');
			}

			const roomType = hotel.roomTypes[0];

			// 2. Check for conflicting bookings
			// Include CONFIRMED bookings and non-expired PENDING_PAYMENT bookings (temporary reservations)
			const now = new Date();
			const conflictingBookings = await tx.hotelBooking.findMany({
				where: {
					hotel_id,
					room_type_id,
					AND: [
						// Date overlap check
						{
							OR: [
								{
									AND: [
										{ check_in: { lte: checkOutDate } },
										{ check_out: { gte: checkInDate } },
									],
								},
							],
						},
						// Status check: CONFIRMED or non-expired PENDING_PAYMENT
						{
							OR: [
								{ status: HotelBookingStatus.CONFIRMED },
								{
									status: HotelBookingStatus.PENDING_PAYMENT,
									OR: [
										{ expires_at: null }, // No expiration set (backward compatibility)
										{ expires_at: { gt: now } }, // Not expired yet
									],
								},
							],
						},
					],
				},
			});

			// 3. Calculate total booked rooms for the date range
			const totalBookedRooms = conflictingBookings.reduce((sum, booking) => sum + booking.quantity, 0);
			const availableRooms = roomType.total_rooms - totalBookedRooms;

			// 4. Strict availability check - reject if not enough rooms
			if (availableRooms < quantity) {
				throw new BadRequestException(
					`Not enough rooms available. Available: ${availableRooms}, Requested: ${quantity}. Please try different dates or room type.`
				);
			}

			// 5. Calculate pricing
			const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
			const basePricePerNight = parseFloat(roomType.base_price.toString());
			const totalAmount = basePricePerNight * quantity * nights;

			// 6. Set expiration time (15 minutes from now for temporary reservation)
			const expiresAt = new Date();
			expiresAt.setMinutes(expiresAt.getMinutes() + 15);

			// 7. Create booking request (PENDING_PAYMENT status with expiration)
			const newBooking = await tx.hotelBooking.create({
				data: {
					user_id,
					hotel_id,
					room_type_id,
					quantity,
					check_in: checkInDate,
					check_out: checkOutDate,
					status: HotelBookingStatus.PENDING_PAYMENT,
				total_amount: totalAmount,
				currency: 'pkr',
				expires_at: expiresAt, // Temporary reservation expires in 15 minutes
				},
				include: {
					hotel: {
						select: { 
							id: true, 
							name: true, 
							address: true,
							city: { select: { name: true } } 
						},
					},
					room_type: {
						select: { 
							id: true, 
							name: true, 
							base_price: true,
							max_occupancy: true 
						},
					},
					user: {
						select: { id: true, full_name: true, email: true },
					},
				},
			});

			return newBooking;
		});

		// Fetch booking with all needed relations for TypeScript type inference
		const bookingWithRelations = await this.prisma.hotelBooking.findUnique({
			where: { id: booking.id },
			include: {
				hotel: {
					select: { 
						id: true, 
						name: true, 
						address: true,
						city: { select: { name: true } },
						manager: {
							include: {
								user: {
									select: { id: true },
								},
							},
						},
					},
				},
				room_type: {
					select: { 
						id: true, 
						name: true, 
						base_price: true,
						max_occupancy: true 
					},
				},
				user: {
					select: { id: true, full_name: true, email: true },
				},
			},
		});

		if (!bookingWithRelations) {
			throw new NotFoundException('Booking not found after creation');
		}

		// Notify hotel manager about new booking request
		try {
			if (bookingWithRelations?.hotel?.manager?.user?.id) {
				await this.notificationsService.createNotification(
					bookingWithRelations.hotel.manager.user.id,
					'hotel_booking_created',
					'New Hotel Booking Request',
					`${bookingWithRelations.user.full_name} has created a booking request for ${bookingWithRelations.hotel.name}. Waiting for payment confirmation.`,
					{
						booking_id: booking.id,
						hotel_id: bookingWithRelations.hotel.id,
					},
				);
			}
		} catch (error) {
			console.error('Failed to notify hotel manager about booking request:', error);
		}

		// 7. Return formatted response
		const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
		const basePricePerNight = parseFloat(bookingWithRelations.room_type.base_price.toString());

		return {
			id: bookingWithRelations.id,
			status: bookingWithRelations.status,
			message: 'Hotel booking request created successfully. Please confirm with payment.',
			expires_at: bookingWithRelations.expires_at?.toISOString() || null, // Include expiration time for frontend countdown
			booking_details: {
				hotel: {
					id: bookingWithRelations.hotel.id.toString(),
					name: bookingWithRelations.hotel.name,
					address: bookingWithRelations.hotel.address,
					city: bookingWithRelations.hotel.city.name,
				},
				room_type: {
					id: bookingWithRelations.room_type.id.toString(),
					name: bookingWithRelations.room_type.name,
					max_occupancy: bookingWithRelations.room_type.max_occupancy,
					price_per_night: basePricePerNight,
				},
				dates: {
					check_in: bookingWithRelations.check_in.toISOString().split('T')[0],
					check_out: bookingWithRelations.check_out.toISOString().split('T')[0],
					nights: nights,
				},
				pricing: {
					base_price_per_night: basePricePerNight,
					quantity: bookingWithRelations.quantity,
					nights: nights,
					total_amount: parseFloat(bookingWithRelations.total_amount.toString()),
					currency: bookingWithRelations.currency,
				},
				guest_notes: guest_notes || null,
			},
			created_at: bookingWithRelations.created_at.toISOString(),
		};
	}

	/**
	 * Create booking with immediate payment (3-step modal flow)
	 * Combines availability check + booking creation + simulated payment in one transaction
	 */
	async createBookingWithPayment(userId: number, dto: CreateBookingWithPaymentDto) {
		const { hotel_id, room_type_id, quantity, check_in, check_out, guest_name, guest_email, guest_phone, special_requests, payment_method } = dto;

		// Validate dates
		const checkInDate = new Date(check_in + 'T00:00:00.000Z');
		const checkOutDate = new Date(check_out + 'T00:00:00.000Z');
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		if (checkInDate < today) {
			throw new BadRequestException('Check-in date cannot be in the past');
		}
		if (checkOutDate <= checkInDate) {
			throw new BadRequestException('Check-out date must be after check-in date');
		}
		if (quantity < 1 || quantity > 10) {
			throw new BadRequestException('Quantity must be between 1 and 10 rooms');
		}

		// Full transactional flow: check availability → create booking → create payment
		const result = await this.prisma.$transaction(async (tx) => {
			// 1. Validate hotel and room type
			const hotel = await tx.hotel.findUnique({
				where: { id: hotel_id },
				include: {
					city: { select: { id: true, name: true } },
					manager: {
						include: {
							user: { select: { id: true, full_name: true } },
						},
					},
					roomTypes: {
						where: { id: room_type_id, is_active: true },
					},
				},
			});

			if (!hotel || !hotel.is_active) {
				throw new NotFoundException('Hotel not found or inactive');
			}
			if (!hotel.manager || !hotel.manager.is_verified) {
				throw new BadRequestException('Hotel manager is not verified');
			}
			if (!hotel.is_listed) {
				throw new BadRequestException('Hotel is not currently listed');
			}
			if (hotel.roomTypes.length === 0) {
				throw new NotFoundException('Room type not found or inactive');
			}

			const roomType = hotel.roomTypes[0];

			// 2. Check availability (same overlap logic as existing method)
			const now = new Date();
			const conflictingBookings = await tx.hotelBooking.findMany({
				where: {
					hotel_id,
					room_type_id,
					AND: [
						{
							OR: [
								{
									AND: [
										{ check_in: { lte: checkOutDate } },
										{ check_out: { gte: checkInDate } },
									],
								},
							],
						},
						{
							OR: [
								{ status: HotelBookingStatus.CONFIRMED },
								{
									status: HotelBookingStatus.PENDING_PAYMENT,
									OR: [
										{ expires_at: null },
										{ expires_at: { gt: now } },
									],
								},
							],
						},
					],
				},
			});

			const totalBookedRooms = conflictingBookings.reduce((sum, b) => sum + b.quantity, 0);
			const availableRooms = roomType.total_rooms - totalBookedRooms;

			if (availableRooms < quantity) {
				throw new BadRequestException(
					`Not enough rooms available. Available: ${availableRooms}, Requested: ${quantity}`,
				);
			}

			// 3. Calculate pricing with tax & service fee
			const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
			const basePricePerNight = parseFloat(roomType.base_price.toString());
			const subtotal = basePricePerNight * quantity * nights;
			const taxRate = 0.15; // 15% tax
			const serviceFeeRate = 0.05; // 5% service fee
			const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
			const serviceFee = Math.round(subtotal * serviceFeeRate * 100) / 100;
			const totalAmount = Math.round((subtotal + taxAmount + serviceFee) * 100) / 100;

			// 4. Create booking directly as CONFIRMED (payment is simulated)
			const newBooking = await tx.hotelBooking.create({
				data: {
					user_id: userId,
					hotel_id,
					room_type_id,
					quantity,
					check_in: checkInDate,
					check_out: checkOutDate,
					status: HotelBookingStatus.CONFIRMED,
					total_amount: totalAmount,
					currency: 'pkr',
					expires_at: null, // No expiry — directly confirmed
				},
			});

			// 5. Create payment transaction record
			const paymentTransaction = await tx.paymentTransaction.create({
				data: {
					booking_hotel_id: newBooking.id,
					user_id: userId,
					amount: totalAmount,
					currency: 'pkr',
					application_fee_amount: serviceFee,
					status: PaymentStatus.completed,
				},
			});

			return {
				booking: newBooking,
				payment: paymentTransaction,
				hotel,
				roomType,
				nights,
				basePricePerNight,
				subtotal,
				taxAmount,
				serviceFee,
				totalAmount,
			};
		});

		// Notify hotel manager
		try {
			if (result.hotel?.manager?.user?.id) {
				const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { full_name: true } });
				await this.notificationsService.createNotification(
					result.hotel.manager.user.id,
					'hotel_booking_confirmed',
					'New Confirmed Booking',
					`${user?.full_name || 'A guest'} has booked ${result.booking.quantity} ${result.roomType.name} room(s) at ${result.hotel.name} (${result.booking.check_in.toISOString().split('T')[0]} to ${result.booking.check_out.toISOString().split('T')[0]})`,
					{
						booking_id: result.booking.id,
						hotel_id: result.hotel.id,
					},
				);
			}
		} catch (error) {
			console.error('Failed to notify hotel manager about booking:', error);
		}

		// Notify user
		try {
			await this.notificationsService.notifyBookingConfirmed(userId, result.booking.id, 'hotel');
		} catch (error) {
			console.error('Failed to notify user about booking confirmation:', error);
		}

		return {
			success: true,
			message: 'Booking confirmed successfully!',
			booking: {
				id: result.booking.id,
				status: result.booking.status,
				hotel: {
					id: result.hotel.id,
					name: result.hotel.name,
					address: result.hotel.address,
					city: result.hotel.city.name,
				},
				room_type: {
					id: result.roomType.id,
					name: result.roomType.name,
					max_occupancy: result.roomType.max_occupancy,
					price_per_night: result.basePricePerNight,
				},
				dates: {
					check_in: check_in,
					check_out: check_out,
					nights: result.nights,
				},
				guest_info: {
					name: guest_name || null,
					email: guest_email || null,
					phone: guest_phone || null,
					special_requests: special_requests || null,
				},
				pricing: {
					base_price_per_night: result.basePricePerNight,
					quantity,
					nights: result.nights,
					subtotal: result.subtotal,
					tax_amount: result.taxAmount,
					tax_rate: 0.15,
					service_fee: result.serviceFee,
					service_fee_rate: 0.05,
					total_amount: result.totalAmount,
					currency: 'pkr',
				},
				payment: {
					id: result.payment.id,
					status: result.payment.status,
					method: payment_method || 'card',
				},
			},
			created_at: result.booking.created_at.toISOString(),
		};
	}

	/**
	 * Get user's hotel bookings
	 */
	async getUserHotelBookings(userId: number, status?: string) {
		const where: any = { user_id: userId };
		if (status) {
			where.status = status;
		}

		const bookings = await this.prisma.hotelBooking.findMany({
			where,
			include: {
				hotel: {
					select: {
						id: true,
						name: true,
						address: true,
						city: { select: { name: true } },
					},
				},
				room_type: {
					select: {
						id: true,
						name: true,
						base_price: true,
						max_occupancy: true,
					},
				},
			},
			orderBy: { created_at: 'desc' },
		});

		return bookings.map((booking) => {
			const nights = Math.ceil((booking.check_out.getTime() - booking.check_in.getTime()) / (1000 * 60 * 60 * 24));
			
			return {
				id: booking.id,
				status: booking.status,
				expires_at: booking.expires_at?.toISOString() || null, // Include expiration for frontend
				hotel: {
					name: booking.hotel.name,
					address: booking.hotel.address,
					city: booking.hotel.city.name,
				},
				room_type: {
					name: booking.room_type.name,
					max_occupancy: booking.room_type.max_occupancy,
				},
				dates: {
					check_in: booking.check_in.toISOString().split('T')[0],
					check_out: booking.check_out.toISOString().split('T')[0],
					nights: nights,
				},
				quantity: booking.quantity,
				total_amount: parseFloat(booking.total_amount.toString()),
				currency: booking.currency,
				created_at: booking.created_at.toISOString(),
			};
		});
	}

	/**
	 * Get hotel booking by ID (with ownership validation)
	 */
	async getHotelBookingById(bookingId: number, userId: number) {
		const booking = await this.prisma.hotelBooking.findUnique({
			where: { id: bookingId },
			include: {
				hotel: {
					select: {
						id: true,
						name: true,
						address: true,
						city: { select: { name: true } },
					},
				},
				room_type: {
					select: {
						id: true,
						name: true,
						base_price: true,
						max_occupancy: true,
					},
				},
				user: {
					select: { id: true, full_name: true, email: true },
				},
			},
		});

		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		// Check if user owns this booking (or is admin - can be added later)
		if (booking.user_id !== userId) {
			throw new BadRequestException('You are not authorized to view this booking');
		}

		const nights = Math.ceil((booking.check_out.getTime() - booking.check_in.getTime()) / (1000 * 60 * 60 * 24));

		return {
			id: booking.id,
			status: booking.status,
			expires_at: booking.expires_at?.toISOString() || null, // Include expiration for frontend
			hotel: {
				id: booking.hotel.id.toString(),
				name: booking.hotel.name,
				address: booking.hotel.address,
				city: booking.hotel.city.name,
			},
			room_type: {
				id: booking.room_type.id.toString(),
				name: booking.room_type.name,
				max_occupancy: booking.room_type.max_occupancy,
				price_per_night: parseFloat(booking.room_type.base_price.toString()),
			},
			dates: {
				check_in: booking.check_in.toISOString().split('T')[0],
				check_out: booking.check_out.toISOString().split('T')[0],
				nights: nights,
			},
			quantity: booking.quantity,
			pricing: {
				base_price_per_night: parseFloat(booking.room_type.base_price.toString()),
				quantity: booking.quantity,
				nights: nights,
				total_amount: parseFloat(booking.total_amount.toString()),
				currency: booking.currency,
			},
			created_at: booking.created_at.toISOString(),
			updated_at: booking.updated_at.toISOString(),
		};
	}

	/**
	 * Confirm hotel booking with payment
	 */
	async confirmHotelBooking(bookingId: number, userId: number) {
		const booking = await this.prisma.hotelBooking.findUnique({
			where: { id: bookingId },
		});

		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		if (booking.user_id !== userId) {
			throw new BadRequestException('You are not authorized to confirm this booking');
		}

		if (booking.status !== HotelBookingStatus.PENDING_PAYMENT) {
			throw new BadRequestException('Booking is not in pending payment status');
		}

		// Check if booking has expired
		if (booking.expires_at && booking.expires_at < new Date()) {
			// Auto-cancel expired booking
			await this.prisma.hotelBooking.update({
				where: { id: bookingId },
				data: {
					status: HotelBookingStatus.CANCELLED,
				},
			});
			throw new BadRequestException('Booking has expired. Please create a new booking.');
		}

		// TODO: Process payment with Stripe
		// For now, simulate successful payment
		const payment = {
			id: `sim_${Date.now()}`,
			charge_id: `ch_${Date.now()}`,
			status: 'completed',
		};

		// Update booking status to CONFIRMED and clear expiration
		const updatedBooking = await this.prisma.hotelBooking.update({
			where: { id: bookingId },
			data: {
				status: HotelBookingStatus.CONFIRMED,
				expires_at: null, // Clear expiration once confirmed
			},
		});

		// TODO: Create payment transaction record
		// Send confirmation notification to client
		await this.notificationsService.notifyBookingConfirmed(userId, bookingId, 'hotel');

		// Notify hotel manager about confirmed booking
		try {
			const bookingWithHotel = await this.prisma.hotelBooking.findUnique({
				where: { id: bookingId },
				include: {
					hotel: {
						include: {
							manager: {
								include: {
									user: {
										select: { id: true, full_name: true },
									},
								},
							},
						},
					},
					user: {
						select: { full_name: true },
					},
				},
			});

			if (bookingWithHotel?.hotel?.manager?.user?.id) {
				await this.notificationsService.createNotification(
					bookingWithHotel.hotel.manager.user.id,
					'hotel_booking_confirmed',
					'Hotel Booking Confirmed',
					`${bookingWithHotel.user.full_name} has confirmed and paid for a booking at ${bookingWithHotel.hotel.name}`,
					{
						booking_id: bookingId,
						hotel_id: bookingWithHotel.hotel.id,
					},
				);
			}
		} catch (error) {
			console.error('Failed to notify hotel manager about booking confirmation:', error);
		}

		// Notify all admins about hotel booking payment
		try {
			const admins = await this.prisma.user.findMany({
				where: {
					role: 'admin',
					status: 'active',
				},
				select: {
					id: true,
				},
			});

			const bookingWithHotel = await this.prisma.hotelBooking.findUnique({
				where: { id: bookingId },
				include: {
					hotel: {
						select: { name: true },
					},
				},
			});

			for (const admin of admins) {
				await this.notificationsService.createNotification(
					admin.id,
					'hotel_booking_payment_received',
					'Hotel Booking Payment Received',
					`Hotel booking #${bookingId} payment of PKR ${parseFloat(updatedBooking.total_amount.toString()).toLocaleString()} has been received for ${bookingWithHotel?.hotel?.name || 'Hotel'}`,
					{
						booking_id: bookingId,
						amount: parseFloat(updatedBooking.total_amount.toString()),
					},
				);
			}
		} catch (error) {
			console.error('Failed to notify admins about hotel booking payment:', error);
		}

		return {
			id: updatedBooking.id,
			status: updatedBooking.status,
			message: 'Hotel booking confirmed successfully!',
			payment_id: payment.id,
		};
	}

	/**
	 * Cancel hotel booking
	 */
	async cancelHotelBooking(bookingId: number, userId: number) {
		const booking = await this.prisma.hotelBooking.findUnique({
			where: { id: bookingId },
		});

		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		if (booking.user_id !== userId) {
			throw new BadRequestException('You are not authorized to cancel this booking');
		}

		if (booking.status === HotelBookingStatus.CANCELLED) {
			throw new BadRequestException('Booking is already cancelled');
		}

		if (booking.status === HotelBookingStatus.CHECKED_OUT) {
			throw new BadRequestException('Cannot cancel completed booking');
		}

		// Update booking status to CANCELLED
		const updatedBooking = await this.prisma.hotelBooking.update({
			where: { id: bookingId },
			data: {
				status: HotelBookingStatus.CANCELLED,
			},
		});

		// TODO: Process refund if payment was made
		// TODO: Send cancellation notifications

		return {
			id: updatedBooking.id,
			status: updatedBooking.status,
			message: 'Hotel booking cancelled successfully',
		};
	}

	/**
	 * Get all hotel bookings for admin
	 */
	async getAllHotelBookingsForAdmin(query: any = {}) {
		const {
			page = 1,
			limit = 20,
			status,
			hotel_id,
			user_id,
		} = query;

		const where: any = {};
		if (status) where.status = status;
		if (hotel_id) where.hotel_id = parseInt(hotel_id);
		if (user_id) where.user_id = parseInt(user_id);

		const [bookings, total] = await Promise.all([
			this.prisma.hotelBooking.findMany({
				where,
				include: {
					hotel: {
						select: {
							id: true,
							name: true,
							city: { select: { name: true } },
						},
					},
					room_type: {
						select: {
							id: true,
							name: true,
						},
					},
					user: {
						select: {
							id: true,
							full_name: true,
							email: true,
						},
					},
				},
				orderBy: { created_at: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
			}),
			this.prisma.hotelBooking.count({ where }),
		]);

		const formattedBookings = bookings.map((booking) => {
			const nights = Math.ceil((booking.check_out.getTime() - booking.check_in.getTime()) / (1000 * 60 * 60 * 24));

			return {
				id: booking.id,
				status: booking.status,
				hotel: {
					name: booking.hotel.name,
					city: booking.hotel.city.name,
				},
				room_type: {
					name: booking.room_type.name,
				},
				customer: {
					name: booking.user.full_name,
					email: booking.user.email,
				},
				dates: {
					check_in: booking.check_in.toISOString().split('T')[0],
					check_out: booking.check_out.toISOString().split('T')[0],
					nights: nights,
				},
				quantity: booking.quantity,
				total_amount: parseFloat(booking.total_amount.toString()),
				currency: booking.currency,
				created_at: booking.created_at.toISOString(),
			};
		});

		return {
			data: formattedBookings,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Get hotel manager bookings for their hotels
	 */
	async getManagerHotelBookings(managerId: number, status?: string) {
		// Get all hotels for this manager
		const hotels = await this.prisma.hotel.findMany({
			where: { manager_id: managerId },
			select: { id: true },
		});
		const hotelIds = hotels.map(h => h.id);

		if (hotelIds.length === 0) {
			return {
				data: [],
				pagination: {
					page: 1,
					limit: 20,
					total: 0,
					totalPages: 0,
				},
			};
		}

		const where: any = {
			hotel_id: { in: hotelIds },
		};

		if (status && status !== 'all') {
			where.status = status;
		}

		const bookings = await this.prisma.hotelBooking.findMany({
			where,
			include: {
				hotel: {
					select: {
						id: true,
						name: true,
						city: { select: { name: true } },
					},
				},
				room_type: {
					select: {
						id: true,
						name: true,
					},
				},
				user: {
					select: {
						id: true,
						full_name: true,
						email: true,
					},
				},
			},
			orderBy: { created_at: 'desc' },
		});

		const formattedBookings = bookings.map((booking) => {
			const nights = Math.ceil((booking.check_out.getTime() - booking.check_in.getTime()) / (1000 * 60 * 60 * 24));

			return {
				id: booking.id,
				status: booking.status,
				hotel: {
					id: booking.hotel.id,
					name: booking.hotel.name,
					city: booking.hotel.city.name,
				},
				room_type: {
					id: booking.room_type.id,
					name: booking.room_type.name,
				},
				customer: {
					id: booking.user.id,
					name: booking.user.full_name,
					email: booking.user.email,
				},
				dates: {
					check_in: booking.check_in.toISOString().split('T')[0],
					check_out: booking.check_out.toISOString().split('T')[0],
					nights: nights,
				},
				quantity: booking.quantity,
				total_amount: parseFloat(booking.total_amount.toString()),
				manager_earnings: parseFloat(booking.total_amount.toString()) * 0.95, // 95% to manager
				currency: booking.currency,
				created_at: booking.created_at.toISOString(),
			};
		});

		return {
			data: formattedBookings,
			total: formattedBookings.length,
		};
	}

	/**
	 * Get hotel manager booking statistics
	 */
	async getManagerBookingStats(managerId: number, dateFrom?: Date, dateTo?: Date) {
		// Get all hotels for this manager
		const hotels = await this.prisma.hotel.findMany({
			where: { manager_id: managerId },
			select: { id: true, name: true },
		});
		const hotelIds = hotels.map(h => h.id);

		if (hotelIds.length === 0) {
			return {
				total_bookings: 0,
				confirmed_bookings: 0,
				cancelled_bookings: 0,
				total_revenue: 0,
				manager_earnings: 0,
				average_booking_value: 0,
				bookings_by_hotel: [],
			};
		}

		const where: any = {
			hotel_id: { in: hotelIds },
		};

		if (dateFrom) {
			where.created_at = { gte: dateFrom };
		}
		if (dateTo) {
			where.created_at = {
				...where.created_at,
				lte: dateTo,
			};
		}

		const [allBookings, confirmedBookings, cancelledBookings] = await Promise.all([
			this.prisma.hotelBooking.findMany({
				where,
				include: {
					hotel: {
						select: {
							id: true,
							name: true,
						},
					},
				},
			}),
			this.prisma.hotelBooking.findMany({
				where: {
					...where,
					status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
				},
				include: {
					hotel: {
						select: {
							id: true,
							name: true,
						},
					},
				},
			}),
			this.prisma.hotelBooking.findMany({
				where: {
					...where,
					status: 'CANCELLED',
				},
			}),
		]);

		const totalRevenue = allBookings
			.filter(b => ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(b.status))
			.reduce((sum, b) => sum + parseFloat(b.total_amount.toString()), 0);
		const managerEarnings = totalRevenue * 0.95;
		const averageBookingValue = confirmedBookings.length > 0
			? totalRevenue / confirmedBookings.length
			: 0;

		// Group by hotel
		const bookingsByHotel: Record<string, { hotel_id: number; hotel_name: string; count: number; revenue: number }> = {};
		for (const booking of confirmedBookings) {
			const hotelName = booking.hotel.name;
			if (!bookingsByHotel[hotelName]) {
				bookingsByHotel[hotelName] = {
					hotel_id: booking.hotel.id,
					hotel_name: hotelName,
					count: 0,
					revenue: 0,
				};
			}
			bookingsByHotel[hotelName].count++;
			bookingsByHotel[hotelName].revenue += parseFloat(booking.total_amount.toString());
		}

		return {
			total_bookings: allBookings.length,
			confirmed_bookings: confirmedBookings.length,
			cancelled_bookings: cancelledBookings.length,
			total_revenue: totalRevenue,
			manager_earnings: managerEarnings,
			average_booking_value: averageBookingValue,
			bookings_by_hotel: Object.values(bookingsByHotel).map(h => ({
				...h,
				manager_earnings: h.revenue * 0.95,
			})),
		};
	}

	/**
	 * Get unavailable dates for a specific room type at a hotel.
	 * A date is "unavailable" when ALL rooms of that type are booked.
	 * Scans 6 months ahead from today.
	 */
	async getRoomUnavailableDates(hotelId: number, roomTypeId: number) {
		// Validate hotel and room type
		const roomType = await this.prisma.hotelRoomType.findFirst({
			where: { id: roomTypeId, hotel_id: hotelId, is_active: true },
		});
		if (!roomType) {
			throw new NotFoundException('Room type not found or inactive');
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Scan 6 months ahead
		const scanEnd = new Date(today);
		scanEnd.setMonth(scanEnd.getMonth() + 6);

		// Get all active bookings for this room type that overlap with our scan window
		const now = new Date();
		const activeBookings = await this.prisma.hotelBooking.findMany({
			where: {
				hotel_id: hotelId,
				room_type_id: roomTypeId,
				check_out: { gte: today },
				check_in: { lte: scanEnd },
				OR: [
					{ status: HotelBookingStatus.CONFIRMED },
					{ status: HotelBookingStatus.CHECKED_IN },
					{
						status: HotelBookingStatus.PENDING_PAYMENT,
						OR: [
							{ expires_at: null },
							{ expires_at: { gt: now } },
						],
					},
				],
			},
			select: {
				check_in: true,
				check_out: true,
				quantity: true,
			},
		});

		// For each date in the scan window, count total booked rooms
		const unavailableDates: string[] = [];
		const current = new Date(today);

		while (current <= scanEnd) {
			const dateStr = current.toISOString().split('T')[0];
			const currentDate = new Date(current);

			// Count rooms booked on this specific date
			let bookedRooms = 0;
			for (const booking of activeBookings) {
				const bookingCheckIn = new Date(booking.check_in);
				const bookingCheckOut = new Date(booking.check_out);
				// A guest occupies the room from check_in to check_out (exclusive of check_out day)
				if (currentDate >= bookingCheckIn && currentDate < bookingCheckOut) {
					bookedRooms += booking.quantity;
				}
			}

			if (bookedRooms >= roomType.total_rooms) {
				unavailableDates.push(dateStr);
			}

			current.setDate(current.getDate() + 1);
		}

		return {
			hotel_id: hotelId,
			room_type_id: roomTypeId,
			total_rooms: roomType.total_rooms,
			unavailable_dates: unavailableDates,
		};
	}
}


