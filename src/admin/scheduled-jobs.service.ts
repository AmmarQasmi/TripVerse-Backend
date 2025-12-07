import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountStatus, HotelBookingStatus } from '@prisma/client';
import { NotificationsService as CommonNotificationsService } from '../common/services/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScheduledJobsService {
	private readonly logger = new Logger(ScheduledJobsService.name);

	constructor(
		@Inject(PrismaService) private prisma: PrismaService,
		private notificationsService: CommonNotificationsService,
	) {}

	/**
	 * Run daily at 5 AM to check and apply scheduled suspensions/bans
	 * Uncomment @Cron decorator after installing @nestjs/schedule
	 */
	@Cron(CronExpression.EVERY_DAY_AT_5AM)
	async processScheduledSuspensions() {
		this.logger.log('Starting scheduled suspension/ban processing...');

		const now = new Date();

		// Find suspensions/bans that should start
		const scheduledActions = await this.prisma.driverDisciplinaryAction.findMany({
			where: {
				action_type: { in: ['suspension', 'ban'] },
				scheduled_start: { lte: now },
				actual_start: null,
				is_paused: false,
			},
			include: {
				driver: {
					include: {
						user: true,
					},
				},
			},
		});

		for (const action of scheduledActions) {
			// Check if driver has active ride
			const activeBooking = await this.prisma.carBooking.findFirst({
				where: {
					car: { driver_id: action.driver_id },
					status: 'IN_PROGRESS',
				},
			});

			if (activeBooking) {
				// Pause suspension if active ride exists
				await this.prisma.driverDisciplinaryAction.update({
					where: { id: action.id },
					data: {
						is_paused: true,
						pause_reason: `active_ride_booking_${activeBooking.id}`,
					},
				});
				this.logger.log(`Suspension ${action.id} paused due to active ride for driver ${action.driver_id}`);
			} else {
				// Apply disciplinary action (suspension/ban)
				await this.applyDisciplinaryAction(action.driver_id, action.id);
				this.logger.log(`Applied ${action.action_type} ${action.id} for driver ${action.driver_id}`);
			}
		}

		// Find suspensions that should end
		const endingActions = await this.prisma.driverDisciplinaryAction.findMany({
			where: {
				action_type: 'suspension',
				scheduled_end: { lte: now },
				actual_end: null,
				actual_start: { not: null },
			},
			include: {
				driver: {
					include: {
						user: true,
					},
				},
			},
		});

		for (const action of endingActions) {
			await this.endSuspension(action.driver_id, action.id);
			this.logger.log(`Ended suspension ${action.id} for driver ${action.driver_id}`);
		}

		// Check for expired periods and reset
		await this.resetExpiredPeriods();

		this.logger.log('Completed scheduled suspension/ban processing');
	}

	/**
	 * Apply disciplinary action (suspension/ban) immediately
	 */
	private async applyDisciplinaryAction(driverId: number, actionId: number): Promise<void> {
		const action = await this.prisma.driverDisciplinaryAction.findUnique({
			where: { id: actionId },
			include: {
				driver: {
					include: {
						user: true,
					},
				},
			},
		});

		if (!action || action.actual_start) return; // Already applied

		const now = new Date();

		// Update user status
		await this.prisma.user.update({
			where: { id: action.driver.user_id },
			data: {
				status: action.action_type === 'ban' ? AccountStatus.banned : AccountStatus.inactive,
			},
		});

		// Deactivate all cars
		await this.prisma.car.updateMany({
			where: { driver_id: driverId },
			data: { is_active: false },
		});

		// Update action with actual start time
		await this.prisma.driverDisciplinaryAction.update({
			where: { id: actionId },
			data: { actual_start: now },
		});

		// Link to driver if suspension
		if (action.action_type === 'suspension') {
			await this.prisma.driver.update({
				where: { id: driverId },
				data: { current_suspension_id: actionId },
			});
		}
	}

	/**
	 * End suspension and reactivate driver
	 */
	private async endSuspension(driverId: number, actionId: number): Promise<void> {
		const action = await this.prisma.driverDisciplinaryAction.findUnique({
			where: { id: actionId },
			include: {
				driver: {
					include: {
						user: true,
					},
				},
			},
		});

		if (!action || action.actual_end) return; // Already ended

		const now = new Date();

		// Reactivate driver
		await this.prisma.user.update({
			where: { id: action.driver.user_id },
			data: { status: AccountStatus.active },
		});

		// Update action
		await this.prisma.driverDisciplinaryAction.update({
			where: { id: actionId },
			data: { actual_end: now },
		});

		// Clear current suspension reference
		await this.prisma.driver.update({
			where: { id: driverId },
			data: { current_suspension_id: null },
		});
	}

	/**
	 * Reset expired 3-month periods
	 */
	private async resetExpiredPeriods(): Promise<void> {
		const now = new Date();

		// Find drivers with expired periods
		const expiredPeriods = await this.prisma.driverDisciplinaryAction.findMany({
			where: {
				period_end: { lte: now },
			},
			select: {
				driver_id: true,
			},
			distinct: ['driver_id'],
		});

		for (const period of expiredPeriods) {
			// Reset last warning for driver
			await this.prisma.driver.update({
				where: { id: period.driver_id },
				data: { last_warning_at: null },
			});
		}

		this.logger.log(`Reset periods for ${expiredPeriods.length} drivers`);
	}

	/**
	 * Cleanup expired hotel booking reservations
	 * Runs every 15 minutes to cancel PENDING_PAYMENT bookings that have expired
	 * Uses batch update for better performance
	 */
	@Cron('*/15 * * * *') // Every 15 minutes (optimized from 5 minutes)
	async cleanupExpiredHotelBookings() {
		this.logger.log('Starting expired hotel booking cleanup...');

		const now = new Date();

		// First, get expired bookings for notifications (only select needed fields)
		const expiredBookings = await this.prisma.hotelBooking.findMany({
			where: {
				status: HotelBookingStatus.PENDING_PAYMENT,
				expires_at: {
					lte: now,
				},
			},
			select: {
				id: true,
				user_id: true,
				hotel: {
					select: {
						name: true,
					},
				},
			},
		});

		if (expiredBookings.length === 0) {
			this.logger.log('No expired bookings to cleanup');
			return;
		}

		this.logger.log(`Found ${expiredBookings.length} expired booking(s) to cancel`);

		// Batch update all expired bookings in one query (much more efficient)
		const updateResult = await this.prisma.hotelBooking.updateMany({
			where: {
				status: HotelBookingStatus.PENDING_PAYMENT,
				expires_at: {
					lte: now,
				},
			},
			data: {
				status: HotelBookingStatus.CANCELLED,
			},
		});

		this.logger.log(`Cancelled ${updateResult.count} expired booking(s) in batch`);

		// Send notifications (can be done asynchronously, errors won't affect cleanup)
		for (const booking of expiredBookings) {
			try {
				await this.notificationsService.createNotification(
					booking.user_id,
					'booking_request',
					'Booking Expired',
					`Your hotel booking for ${booking.hotel.name} has expired. The room reservation was held for 15 minutes. Please create a new booking if you still wish to proceed.`,
					{ booking_id: booking.id, booking_type: 'hotel' },
				);
			} catch (error) {
				this.logger.error(`Failed to send notification for booking ${booking.id}:`, error);
			}
		}

		this.logger.log(`Completed expired booking cleanup. Cancelled ${updateResult.count} booking(s)`);
	}
}

