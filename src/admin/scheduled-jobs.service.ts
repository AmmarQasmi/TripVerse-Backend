import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AccountStatus } from '@prisma/client';

@Injectable()
export class ScheduledJobsService {
	private readonly logger = new Logger(ScheduledJobsService.name);

	constructor(private prisma: PrismaService) {}

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
}

