import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { NotificationsService as CommonNotificationsService } from '../common/services/notifications.service';
import { HotelBookingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingWithPaymentDto } from './dto/create-booking-with-payment.dto';
import { WalletService, TransactionType } from '../payments/wallet.service';
import { COMMISSION_POLICY } from '../common/utils/constants';

@Injectable()
export class BookingsService {
	constructor(
		@Inject(PrismaService) private prisma: PrismaService,
		private notificationsService: CommonNotificationsService,
		private walletService: WalletService,
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
		const { hotel_id, room_type_id, quantity, check_in, check_out, guest_name, guest_email, guest_phone, special_requests, payment_method, cash_policy_acknowledged } = dto;

		const normalizedPaymentMethod = (payment_method || 'card').toLowerCase();
		if (!['card', 'cash', 'wallet'].includes(normalizedPaymentMethod)) {
			throw new BadRequestException('Invalid payment method. Use card, wallet, or cash');
		}

		if (normalizedPaymentMethod === 'cash' && cash_policy_acknowledged !== true) {
			throw new BadRequestException('Cash bookings require policy acknowledgment before confirmation');
		}

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
			const totalAmountInPaisa = BigInt(Math.round(totalAmount * 100));
			let applicationFeeAmount = serviceFee;
			let walletSettlementSummary:
				| { customerDeducted: bigint; managerCredited: bigint; platformCredited: bigint }
				| null = null;

			// Wallet settlement happens after booking is created, so ledger metadata can include bookingId.

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

			if (normalizedPaymentMethod === 'wallet') {
				const customerWallet = await tx.wallet.upsert({
					where: {
						user_id_userType: {
							user_id: userId,
							userType: 'client',
						},
					},
					update: {},
					create: {
						user_id: userId,
						userType: 'client',
					},
				});

				const customerAvailable = customerWallet.balance - customerWallet.reserved - customerWallet.locked;
				if (customerAvailable < totalAmountInPaisa) {
					throw new BadRequestException(
						`Insufficient wallet balance. Required PKR ${(Number(totalAmountInPaisa) / 100).toFixed(2)}, available PKR ${(Number(customerAvailable) / 100).toFixed(2)}.`,
					);
				}

				if (!hotel.manager.user_id) {
					throw new BadRequestException('Hotel manager user account is missing');
				}

				const managerWallet = await tx.wallet.upsert({
					where: {
						user_id_userType: {
							user_id: hotel.manager.user_id,
							userType: 'hotel_manager',
						},
					},
					update: {},
					create: {
						user_id: hotel.manager.user_id,
						userType: 'hotel_manager',
					},
				});

				const adminUser = await tx.user.findFirst({ where: { role: 'admin' }, select: { id: true } });
				if (!adminUser) {
					throw new BadRequestException('Admin account not found for wallet settlement');
				}

				const adminWallet = await tx.wallet.upsert({
					where: {
						user_id_userType: {
							user_id: adminUser.id,
							userType: 'admin',
						},
					},
					update: {},
					create: {
						user_id: adminUser.id,
						userType: 'admin',
					},
				});

				const managerShare = BigInt(
					Math.round(Number(totalAmountInPaisa) * COMMISSION_POLICY.PROVIDER_SHARE),
				);
				const platformShare = totalAmountInPaisa - managerShare;
				applicationFeeAmount = Number(platformShare) / 100;
				const netCommissionShare = BigInt(
					Math.round(Number(platformShare) * COMMISSION_POLICY.NET_COMMISSION_SPLIT),
				);
				const taxReserveShare = platformShare - netCommissionShare;

				await tx.wallet.update({
					where: { id: customerWallet.id },
					data: {
						balance: {
							decrement: totalAmountInPaisa,
						},
					},
				});
				await tx.walletTransaction.create({
					data: {
						wallet_id: customerWallet.id,
						type: TransactionType.DEDUCTION,
						amount: -totalAmountInPaisa,
						description: `Wallet payment for hotel booking #${newBooking.id}`,
						metadata: {
							bookingId: newBooking.id,
							hotelId: hotel_id,
							roomTypeId: room_type_id,
							paymentMethod: 'wallet',
						},
					},
				});

				await tx.wallet.update({
					where: { id: managerWallet.id },
					data: {
						balance: {
							increment: managerShare,
						},
					},
				});
				await tx.walletTransaction.create({
					data: {
						wallet_id: managerWallet.id,
						type: TransactionType.COMMISSION,
						amount: managerShare,
						description: `Hotel booking payout (85%) for booking #${newBooking.id}`,
						metadata: {
							bookingId: newBooking.id,
							hotelId: hotel_id,
							roomTypeId: room_type_id,
							paymentMethod: 'wallet',
						},
					},
				});

				await tx.wallet.update({
					where: { id: adminWallet.id },
					data: {
						balance: {
							increment: platformShare,
						},
					},
				});
				if (netCommissionShare > 0n) {
					await tx.walletTransaction.create({
						data: {
							wallet_id: adminWallet.id,
							type: TransactionType.COMMISSION,
							amount: netCommissionShare,
							description: `Hotel booking net commission for booking #${newBooking.id}`,
							metadata: {
								bookingId: newBooking.id,
								hotelId: hotel_id,
								roomTypeId: room_type_id,
								paymentMethod: 'wallet',
							},
						},
					});
				}
				if (taxReserveShare > 0n) {
					await tx.walletTransaction.create({
						data: {
							wallet_id: adminWallet.id,
							type: TransactionType.TAX_RESERVE,
							amount: taxReserveShare,
							description: `Hotel booking tax reserve for booking #${newBooking.id}`,
							metadata: {
								bookingId: newBooking.id,
								hotelId: hotel_id,
								roomTypeId: room_type_id,
								paymentMethod: 'wallet',
							},
						},
					});
				}

				walletSettlementSummary = {
					customerDeducted: totalAmountInPaisa,
					managerCredited: managerShare,
					platformCredited: platformShare,
				};

			}

			// 5. Create payment transaction record
			const paymentTransaction = await tx.paymentTransaction.create({
				data: {
					booking_hotel_id: newBooking.id,
					user_id: userId,
					amount: totalAmount,
					currency: 'pkr',
					application_fee_amount: applicationFeeAmount,
					payment_method:
						normalizedPaymentMethod === 'cash'
							? PaymentMethod.cash
							: normalizedPaymentMethod === 'wallet'
								? PaymentMethod.wallet
								: PaymentMethod.online,
					status: PaymentStatus.completed,
				},
			});

			// 6. Handle CASH payment - create hotel debt
			let hotelDebtCreated = false;
			let autoRecoveredAmount = 0n;
			if (normalizedPaymentMethod === 'cash') {
				// For cash bookings, the manager collects the full amount in cash.
				// Platform should only secure its commission (15%) as debt.
				const totalAmountInPaisa = BigInt(Math.round(totalAmount * 100));
				const platformCommissionInPaisa = (totalAmountInPaisa * 1500n) / 10000n; // 15%
				const dueAt = new Date(checkInDate.getTime() + 30 * 24 * 60 * 60 * 1000); // Check-in + 30 days

				// Ensure hotel manager wallet exists
				const managerWallet = await this.walletService.ensureWallet(hotel.manager.user_id, 'hotel_manager');

				// Create wallet transaction for hotel debt
				await tx.walletTransaction.create({
					data: {
						wallet_id: managerWallet.id,
						type: 'hotel_debt',
						amount: -platformCommissionInPaisa, // Negative because it's a debt obligation
						description: `Hotel commission debt (15%) for booking #${newBooking.id}`,
						metadata: {
							bookingId: newBooking.id,
							hotelId: hotel_id,
							hotelName: hotel.name,
							roomType: roomType.name,
							guestName: guest_name,
							checkIn: checkInDate.toISOString(),
							checkOut: checkOutDate.toISOString(),
							dueAt: dueAt.toISOString(),
							status: 'pending',
							gracePeriodUntil: new Date(dueAt.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
							paymentMethod: 'cash',
							grossAmountInPaisa: totalAmountInPaisa.toString(),
							commissionRate: 0.15,
							createdAt: new Date().toISOString(),
						},
					},
				});

				hotelDebtCreated = true;
			}

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
				walletSettlementSummary,
				hotelDebtCreated,
				autoRecoveredAmount,
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

				// Send debt notification for CASH payments
				if (result.hotelDebtCreated) {
					if (result.autoRecoveredAmount > 0n) {
						// Immediate recovery successful
						await this.notificationsService.createNotification(
							result.hotel.manager.user.id,
							'payment_received',
							'Hotel Debt Collected',
							`Hotel debt of PKR ${(Number(result.autoRecoveredAmount) / 100).toFixed(2)} for booking #${result.booking.id} has been automatically collected from your wallet under the check-in + 30 days policy.`,
							{
								booking_id: result.booking.id,
								debtAmount: result.autoRecoveredAmount.toString(),
								status: 'auto_recovered',
								checkInTime: result.booking.check_in.toISOString(),
							},
						).catch(err => console.error('Failed to notify of auto-recovery:', err));
					} else {
						// Debt pending collection
						const dueAt = new Date(result.booking.check_in.getTime() + 30 * 24 * 60 * 60 * 1000);
						const totalAmountInPaisa = BigInt(Math.round(result.totalAmount * 100));
						const platformCommissionInPaisa = (totalAmountInPaisa * 1500n) / 10000n; // 15%
						await this.notificationsService.createNotification(
							result.hotel.manager.user.id,
							'booking_request',
							'Hotel Debt Created - Payment Pending',
							`Hotel commission debt (15%) of PKR ${(Number(platformCommissionInPaisa) / 100).toFixed(2)} for booking #${result.booking.id} will be collected on ${dueAt.toISOString()} (check-in + 30 days). Grace period: 3 days.`,
							{
								booking_id: result.booking.id,
								debtAmount: platformCommissionInPaisa.toString(),
								status: 'pending',
								dueAt: dueAt.toISOString(),
								gracePeriodDays: 3,
								checkInTime: result.booking.check_in.toISOString(),
							},
						).catch(err => console.error('Failed to notify of pending debt:', err));
					}
				}
			}
		} catch (error) {
			console.error('Failed to notify hotel manager about booking:', error);
		}

		// Notify user
		try {
			await this.notificationsService.notifyBookingConfirmed(userId, result.booking.id, 'hotel');

			if (result.walletSettlementSummary) {
				await this.notificationsService.createNotification(
					userId,
					'payment_received',
					'Wallet Payment Deducted',
					`PKR ${(Number(result.walletSettlementSummary.customerDeducted) / 100).toFixed(2)} was deducted from your wallet for booking #${result.booking.id}.`,
					{
						booking_id: result.booking.id,
						amount: result.walletSettlementSummary.customerDeducted.toString(),
						payment_method: 'wallet',
					},
				);

				if (result.hotel?.manager?.user?.id) {
					await this.notificationsService.createNotification(
						result.hotel.manager.user.id,
						'payment_received',
						'Wallet Payout Received',
						`PKR ${(Number(result.walletSettlementSummary.managerCredited) / 100).toFixed(2)} was credited to your wallet from booking #${result.booking.id}.`,
						{
							booking_id: result.booking.id,
							amount: result.walletSettlementSummary.managerCredited.toString(),
							payment_method: 'wallet',
						},
					);
				}
			}
		} catch (error) {
			console.error('Failed to notify user about booking confirmation:', error);
		}

		// Notify admins about hotel booking money movement (wallet/cash debt)
		try {
			const admins = await this.prisma.user.findMany({
				where: { role: 'admin', status: 'active' },
				select: { id: true },
			});

			for (const admin of admins) {
				if (result.walletSettlementSummary) {
					await this.notificationsService.createNotification(
						admin.id,
						'hotel_booking_payment_received',
						'Hotel Wallet Transaction Recorded',
						`Booking #${result.booking.id}: customer paid PKR ${(Number(result.walletSettlementSummary.customerDeducted) / 100).toFixed(2)} via wallet. Platform credited PKR ${(Number(result.walletSettlementSummary.platformCredited) / 100).toFixed(2)}.`,
						{
							booking_id: result.booking.id,
							payment_method: 'wallet',
							customer_amount: result.walletSettlementSummary.customerDeducted.toString(),
							platform_amount: result.walletSettlementSummary.platformCredited.toString(),
						},
					);
				}

				if (result.hotelDebtCreated) {
					const grossAmountInPaisa = BigInt(Math.round(result.totalAmount * 100));
					const debtAmountInPaisa = (grossAmountInPaisa * 1500n) / 10000n; // 15%
					await this.notificationsService.createNotification(
						admin.id,
						'hotel_booking_payment_received',
						'Hotel Cash Debt Recorded',
						`Booking #${result.booking.id} was confirmed with cash. Platform commission debt (15%) PKR ${(Number(debtAmountInPaisa) / 100).toFixed(2)} was recorded for manager settlement policy.`,
						{
							booking_id: result.booking.id,
							payment_method: 'cash',
							debt_amount: debtAmountInPaisa.toString(),
							gross_amount: grossAmountInPaisa.toString(),
							commission_rate: 0.15,
						},
					);
				}

				if (!result.walletSettlementSummary && !result.hotelDebtCreated) {
					await this.notificationsService.createNotification(
						admin.id,
						'hotel_booking_payment_received',
						'Hotel Online Payment Recorded',
						`Booking #${result.booking.id} payment of PKR ${result.totalAmount.toFixed(2)} was received via online/card method.`,
						{
							booking_id: result.booking.id,
							payment_method: 'online',
							amount: result.totalAmount,
						},
					);
				}
			}
		} catch (error) {
			console.error('Failed to notify admins about hotel booking transaction:', error);
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
			hotelDebt: result.hotelDebtCreated ? {
				created: true,
					dueAt: new Date(result.booking.check_in.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
				amount: ((BigInt(Math.round(result.totalAmount * 100)) * 1500n) / 10000n).toString(),
				autoRecovered: result.autoRecoveredAmount > 0n,
				recoveredAmount: result.autoRecoveredAmount > 0n ? (Number(result.autoRecoveredAmount) / 100).toFixed(2) : null,
				gracePeriodDays: 3,
				status: result.autoRecoveredAmount > 0n ? 'recovered' : 'pending',
			} : null,
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
			include: {
				hotel: {
					include: {
						manager: true,
					},
				},
				payments: {
					orderBy: { created_at: 'desc' },
					take: 1,
				},
			},
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

		const now = new Date();
		const cancellationDeadline = new Date(booking.check_in.getTime() - 24 * 60 * 60 * 1000);
		if (now >= cancellationDeadline) {
			throw new BadRequestException('Cancellation is only allowed before 1 day prior to check-in');
		}

		const lastPayment = booking.payments[0];
		const isCashBooking = lastPayment?.payment_method === PaymentMethod.cash;
		const isWalletBooking = lastPayment?.payment_method === PaymentMethod.wallet;
		const totalAmountInPaisa = BigInt(Math.round(Number(booking.total_amount) * 100));
		const refundAmountInPaisa = (totalAmountInPaisa * 90n) / 100n;

		const updatedBooking = await this.prisma.$transaction(async (tx) => {
			let txWalletRefundSummary: { customerRefunded: bigint; managerDebited: bigint; adminDebited: bigint } | null = null;
			let txCashCancellationSummary: { customerDebited: bigint; managerCredited: bigint; adminCredited: bigint } | null = null;
			if (isCashBooking) {
				const customerDebt = (totalAmountInPaisa * 25n) / 100n;
				const managerCompensation = (totalAmountInPaisa * 10n) / 100n;
				const adminShare = customerDebt - managerCompensation;

				const customerWallet = await tx.wallet.upsert({
					where: {
						user_id_userType: {
							user_id: userId,
							userType: 'client',
						},
					},
					update: {},
					create: {
						user_id: userId,
						userType: 'client',
					},
				});
				const managerUserId = booking.hotel.manager?.user_id;
				if (!managerUserId) {
					throw new BadRequestException('Hotel manager not found for cancellation compensation');
				}

				const managerWallet = await tx.wallet.upsert({
					where: {
						user_id_userType: {
							user_id: managerUserId,
							userType: 'hotel_manager',
						},
					},
					update: {},
					create: {
						user_id: managerUserId,
						userType: 'hotel_manager',
					},
				});
				const adminUser = await tx.user.findFirst({ where: { role: 'admin' }, select: { id: true } });
				if (!adminUser) {
					throw new BadRequestException('Admin account not found for cancellation settlement');
				}

				const adminWallet = await tx.wallet.upsert({
					where: {
						user_id_userType: {
							user_id: adminUser.id,
							userType: 'admin',
						},
					},
					update: {},
					create: {
						user_id: adminUser.id,
						userType: 'admin',
					},
				});

				// Record customer debt and allow wallet to go negative as intended debt behavior.
				await tx.walletTransaction.create({
					data: {
						wallet_id: customerWallet.id,
						type: TransactionType.DEDUCTION,
						amount: -customerDebt,
						description: `Cash hotel cancellation debt for booking #${booking.id}`,
						metadata: {
							bookingId: booking.id,
							type: 'hotel_cash_cancellation_debt',
							status: 'pending',
							managerCompensation: managerCompensation.toString(),
							adminShare: adminShare.toString(),
						},
					},
				});

				await tx.wallet.update({
					where: { id: customerWallet.id },
					data: {
						balance: {
							decrement: customerDebt,
						},
					},
				});

				await tx.walletTransaction.create({
					data: {
						wallet_id: managerWallet.id,
						type: TransactionType.REFUND,
						amount: managerCompensation,
						description: `Cash cancellation compensation for booking #${booking.id}`,
						metadata: {
							bookingId: booking.id,
							type: 'cash_cancellation_compensation',
						},
					},
				});
				await tx.wallet.update({
					where: { id: managerWallet.id },
					data: {
						balance: {
							increment: managerCompensation,
						},
					},
				});

				await tx.walletTransaction.create({
					data: {
						wallet_id: adminWallet.id,
						type: TransactionType.COMMISSION,
						amount: adminShare,
						description: `Cash cancellation admin share for booking #${booking.id}`,
						metadata: {
							bookingId: booking.id,
							type: 'cash_cancellation_admin_share',
						},
					},
				});
				await tx.wallet.update({
					where: { id: adminWallet.id },
					data: {
						balance: {
							increment: adminShare,
						},
					},
				});

				// Cancel related pending hotel debt for this booking.
				const relatedHotelDebts = await tx.walletTransaction.findMany({
					where: {
						wallet_id: managerWallet.id,
						type: TransactionType.HOTEL_DEBT,
					},
				});

				for (const debtTx of relatedHotelDebts) {
					const metadata = (debtTx.metadata || {}) as Record<string, any>;
					if (metadata.bookingId === booking.id && metadata.status !== 'recovered' && metadata.status !== 'cancelled') {
						await tx.walletTransaction.update({
							where: { id: debtTx.id },
							data: {
								metadata: {
									...metadata,
									status: 'cancelled',
									cancelledAt: new Date().toISOString(),
									cancelledReason: 'booking_cancelled_by_customer',
								},
							},
						});
					}
				}

				txCashCancellationSummary = {
					customerDebited: customerDebt,
					managerCredited: managerCompensation,
					adminCredited: adminShare,
				};
			}

			if (isWalletBooking) {
				const customerWallet = await tx.wallet.upsert({
					where: {
						user_id_userType: {
							user_id: userId,
							userType: 'client',
						},
					},
					update: {},
					create: {
						user_id: userId,
						userType: 'client',
					},
				});

				const managerUserId = booking.hotel.manager?.user_id;
				if (!managerUserId) {
					throw new BadRequestException('Hotel manager not found for wallet refund');
				}

				const managerWallet = await tx.wallet.upsert({
					where: {
						user_id_userType: {
							user_id: managerUserId,
							userType: 'hotel_manager',
						},
					},
					update: {},
					create: {
						user_id: managerUserId,
						userType: 'hotel_manager',
					},
				});

				const adminUser = await tx.user.findFirst({ where: { role: 'admin' }, select: { id: true } });
				if (!adminUser) {
					throw new BadRequestException('Admin account not found for wallet refund settlement');
				}

				const adminWallet = await tx.wallet.upsert({
					where: {
						user_id_userType: {
							user_id: adminUser.id,
							userType: 'admin',
						},
					},
					update: {},
					create: {
						user_id: adminUser.id,
						userType: 'admin',
					},
				});

				const managerShare = BigInt(
					Math.round(Number(totalAmountInPaisa) * COMMISSION_POLICY.PROVIDER_SHARE),
				);
				const managerReversal = managerShare >= refundAmountInPaisa ? refundAmountInPaisa : managerShare;
				const adminReversal = refundAmountInPaisa - managerReversal;

				await tx.wallet.update({
					where: { id: customerWallet.id },
					data: {
						balance: {
							increment: refundAmountInPaisa,
						},
					},
				});
				await tx.walletTransaction.create({
					data: {
						wallet_id: customerWallet.id,
						type: TransactionType.REFUND,
						amount: refundAmountInPaisa,
						description: `Wallet refund (90%) for cancelled hotel booking #${booking.id}`,
						metadata: {
							bookingId: booking.id,
							type: 'hotel_booking_wallet_refund',
							refundRate: '90%',
						},
					},
				});

				await tx.wallet.update({
					where: { id: managerWallet.id },
					data: {
						balance: {
							decrement: managerReversal,
						},
					},
				});
				await tx.walletTransaction.create({
					data: {
						wallet_id: managerWallet.id,
						type: TransactionType.DEDUCTION,
						amount: -managerReversal,
						description: `Wallet payout reversal for cancelled booking #${booking.id}`,
						metadata: {
							bookingId: booking.id,
							type: 'hotel_booking_wallet_reversal',
							refundRate: '90%',
						},
					},
				});

				if (adminReversal > 0n) {
					await tx.wallet.update({
						where: { id: adminWallet.id },
						data: {
							balance: {
								decrement: adminReversal,
							},
						},
					});
					await tx.walletTransaction.create({
						data: {
							wallet_id: adminWallet.id,
							type: TransactionType.DEDUCTION,
							amount: -adminReversal,
							description: `Platform share reversal for cancelled booking #${booking.id}`,
							metadata: {
								bookingId: booking.id,
								type: 'hotel_booking_platform_reversal',
								refundRate: '90%',
							},
						},
					});
				}

				txWalletRefundSummary = {
					customerRefunded: refundAmountInPaisa,
					managerDebited: managerReversal,
					adminDebited: adminReversal,
				};
			}

			await tx.bookingCancellation.create({
				data: {
					booking_hotel_id: booking.id,
					cancelled_by: 'client',
					reason: isCashBooking ? 'Cash booking cancellation with debt policy' : 'Customer cancellation',
					refund_amount: isCashBooking ? 0 : Number(refundAmountInPaisa) / 100,
				},
			});

			if (lastPayment && !isCashBooking) {
				await tx.paymentTransaction.update({
					where: { id: lastPayment.id },
					data: {
						status: PaymentStatus.refunded,
					},
				});
			}

			const cancelledBooking = await tx.hotelBooking.update({
				where: { id: bookingId },
				data: {
					status: HotelBookingStatus.CANCELLED,
				},
			});

			return {
				booking: cancelledBooking,
				walletRefundSummary: txWalletRefundSummary,
				cashCancellationSummary: txCashCancellationSummary,
			};
		});

		if (updatedBooking.cashCancellationSummary) {
			this.notificationsService.createNotification(
				userId,
				'payment_received',
				'Cash Cancellation Charge Applied',
				`PKR ${(Number(updatedBooking.cashCancellationSummary.customerDebited) / 100).toFixed(2)} was deducted from your wallet as the cancellation charge for cash booking #${booking.id}.`,
				{
					booking_id: booking.id,
					amount: updatedBooking.cashCancellationSummary.customerDebited.toString(),
					payment_method: 'cash',
				},
			).catch((error) => console.error('Failed to notify customer cash cancellation charge:', error));

			const managerUserId = booking.hotel.manager?.user_id;
			if (managerUserId) {
				this.notificationsService.createNotification(
					managerUserId,
					'payment_received',
					'Cash Cancellation Compensation Received',
					`PKR ${(Number(updatedBooking.cashCancellationSummary.managerCredited) / 100).toFixed(2)} was credited as cancellation compensation for booking #${booking.id}.`,
					{
						booking_id: booking.id,
						amount: updatedBooking.cashCancellationSummary.managerCredited.toString(),
						payment_method: 'cash',
					},
				).catch((error) => console.error('Failed to notify manager cash cancellation compensation:', error));
			}

			this.prisma.user.findMany({
				where: { role: 'admin', status: 'active' },
				select: { id: true },
			}).then((admins) => Promise.all(
				admins.map((admin) => this.notificationsService.createNotification(
					admin.id,
					'payment_received',
					'Cash Cancellation Admin Share Received',
					`PKR ${(Number(updatedBooking.cashCancellationSummary!.adminCredited) / 100).toFixed(2)} was credited as admin share for cancelled cash booking #${booking.id}.`,
					{
						booking_id: booking.id,
						amount: updatedBooking.cashCancellationSummary!.adminCredited.toString(),
						payment_method: 'cash',
					},
				)),
			)).catch((error) => console.error('Failed to notify admins cash cancellation share:', error));
		}

		if (updatedBooking.walletRefundSummary) {
			this.notificationsService.createNotification(
				userId,
				'payment_received',
				'Wallet Refund Processed',
				`PKR ${(Number(updatedBooking.walletRefundSummary.customerRefunded) / 100).toFixed(2)} (90%) was refunded to your wallet for cancelled booking #${booking.id}.`,
				{
					booking_id: booking.id,
					amount: updatedBooking.walletRefundSummary.customerRefunded.toString(),
					refund_rate: '90%',
				},
			).catch((error) => console.error('Failed to notify customer wallet refund:', error));

			const managerUserId = booking.hotel.manager?.user_id;
			if (managerUserId) {
				this.notificationsService.createNotification(
					managerUserId,
					'payment_received',
					'Wallet Payout Reversed',
					`PKR ${(Number(updatedBooking.walletRefundSummary.managerDebited) / 100).toFixed(2)} was deducted from your wallet due to cancellation of booking #${booking.id}.`,
					{
						booking_id: booking.id,
						amount: updatedBooking.walletRefundSummary.managerDebited.toString(),
					},
				).catch((error) => console.error('Failed to notify manager wallet reversal:', error));
			}

			this.prisma.user.findMany({
				where: { role: 'admin', status: 'active' },
				select: { id: true },
			}).then((admins) => Promise.all(
				admins.map((admin) => this.notificationsService.createNotification(
					admin.id,
					'payment_received',
					'Hotel Wallet Cancellation Processed',
					`Booking #${booking.id} cancelled: customer refunded PKR ${(Number(updatedBooking.walletRefundSummary!.customerRefunded) / 100).toFixed(2)} (90%). Admin reversal PKR ${(Number(updatedBooking.walletRefundSummary!.adminDebited) / 100).toFixed(2)}.`,
					{
						booking_id: booking.id,
						refunded_amount: updatedBooking.walletRefundSummary!.customerRefunded.toString(),
						admin_reversal_amount: updatedBooking.walletRefundSummary!.adminDebited.toString(),
						payment_method: 'wallet',
					},
				)),
			)).catch((error) => console.error('Failed to notify admins wallet cancellation:', error));
		}

		if (lastPayment && !isCashBooking && !isWalletBooking) {
			this.notificationsService.createNotification(
				userId,
				'payment_received',
				'Refund Initiated',
				`Your online/card payment for booking #${booking.id} was marked for refund after cancellation.`,
				{
					booking_id: booking.id,
					payment_method: 'online',
					amount: totalAmountInPaisa.toString(),
				},
			).catch((error) => console.error('Failed to notify customer online refund:', error));

			this.prisma.user.findMany({
				where: { role: 'admin', status: 'active' },
				select: { id: true },
			}).then((admins) => Promise.all(
				admins.map((admin) => this.notificationsService.createNotification(
					admin.id,
					'payment_received',
					'Hotel Online Refund Marked',
					`Booking #${booking.id} cancelled: online/card payment refund was marked for PKR ${(Number(totalAmountInPaisa) / 100).toFixed(2)}.`,
					{
						booking_id: booking.id,
						payment_method: 'online',
						amount: totalAmountInPaisa.toString(),
					},
				)),
			)).catch((error) => console.error('Failed to notify admins online cancellation refund:', error));
		}

		return {
			id: updatedBooking.booking.id,
			status: updatedBooking.booking.status,
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
				manager_earnings: parseFloat(booking.total_amount.toString()) * 0.85, // 85% to manager
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
		const managerEarnings = totalRevenue * 0.85;
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
				manager_earnings: h.revenue * 0.85,
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


