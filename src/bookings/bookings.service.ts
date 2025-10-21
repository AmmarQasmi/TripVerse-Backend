import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HotelBookingStatus } from '@prisma/client';

@Injectable()
export class BookingsService {
	constructor(private prisma: PrismaService) {}

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
					roomTypes: {
						where: { id: room_type_id, is_active: true },
					},
				},
			});

			if (!hotel || !hotel.is_active) {
				throw new NotFoundException('Hotel not found or inactive');
			}

			if (hotel.roomTypes.length === 0) {
				throw new NotFoundException('Room type not found or inactive');
			}

			const roomType = hotel.roomTypes[0];

			// 2. Check for conflicting bookings (only CONFIRMED bookings block availability)
			const conflictingBookings = await tx.hotelBooking.findMany({
				where: {
					hotel_id,
					room_type_id,
					status: HotelBookingStatus.CONFIRMED, // Only confirmed bookings block availability
					OR: [
						{
							AND: [
								{ check_in: { lte: checkOutDate } },
								{ check_out: { gte: checkInDate } },
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

			// 6. Create booking request (PENDING_PAYMENT status)
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
					currency: 'usd',
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

		// 7. Return formatted response
		const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
		const basePricePerNight = parseFloat(booking.room_type.base_price.toString());

		return {
			id: booking.id,
			status: booking.status,
			message: 'Hotel booking request created successfully. Please confirm with payment.',
			booking_details: {
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
					price_per_night: basePricePerNight,
				},
				dates: {
					check_in: booking.check_in.toISOString().split('T')[0],
					check_out: booking.check_out.toISOString().split('T')[0],
					nights: nights,
				},
				pricing: {
					base_price_per_night: basePricePerNight,
					quantity: booking.quantity,
					nights: nights,
					total_amount: parseFloat(booking.total_amount.toString()),
					currency: booking.currency,
				},
				guest_notes: guest_notes || null,
			},
			created_at: booking.created_at.toISOString(),
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

		// TODO: Process payment with Stripe
		// For now, simulate successful payment
		const payment = {
			id: `sim_${Date.now()}`,
			charge_id: `ch_${Date.now()}`,
			status: 'completed',
		};

		// Update booking status to CONFIRMED
		const updatedBooking = await this.prisma.hotelBooking.update({
			where: { id: bookingId },
			data: {
				status: HotelBookingStatus.CONFIRMED,
			},
		});

		// TODO: Create payment transaction record
		// TODO: Send confirmation notifications

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
}


