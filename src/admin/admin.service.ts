import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DriversService } from '../drivers/drivers.service';
import { NotificationsService as CommonNotificationsService } from '../common/services/notifications.service';
import { VerifyDriverDto } from '../drivers/dto/verify-driver.dto';
import { VerifyHotelManagerDto } from '../hotel-managers/dto/verify-manager.dto';
import { SuspendDriverDto } from './dto/suspend-driver.dto';
import { BanDriverDto } from './dto/ban-driver.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { DriverFiltersDto } from './dto/driver-filters.dto';
import { DisputeFiltersDto } from './dto/dispute-filters.dto';
import { AccountStatus, DisputeStatus, NotificationType } from '@prisma/client';

@Injectable()
export class AdminService {
	constructor(
		private prisma: PrismaService,
		private driversService: DriversService,
		private notificationsService: CommonNotificationsService,
	) {}

	/**
	 * Get dashboard statistics
	 */
	async getDashboardStats() {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const thisWeek = new Date(today);
		thisWeek.setDate(today.getDate() - 7);

		const thisMonth = new Date(today);
		thisMonth.setMonth(today.getMonth() - 1);

		// Driver statistics
		const [verifiedDrivers, pendingDrivers, totalDrivers] = await Promise.all([
			this.prisma.driver.count({ where: { is_verified: true } }),
			this.prisma.driver.count({
				where: {
					is_verified: false,
					documents: {
						some: { status: 'pending' },
					},
				},
			}),
			this.prisma.driver.count(),
		]);

		// Hotel Manager statistics
		const [verifiedHotelManagers, pendingHotelManagers, totalHotelManagers] = await Promise.all([
			this.prisma.hotelManager.count({ where: { is_verified: true } }),
			this.prisma.hotelManager.count({
				where: {
					is_verified: false,
					documents: {
						some: { status: 'pending' },
					},
				},
			}),
			this.prisma.hotelManager.count(),
		]);

		// Booking statistics - optimized with parallel queries
		const [
			hotelBookingsToday,
			carBookingsToday,
			hotelBookingsThisWeek,
			carBookingsThisWeek,
			hotelBookingsThisMonth,
			carBookingsThisMonth,
			totalHotelBookings,
			totalCarBookings,
		] = await Promise.all([
			this.prisma.hotelBooking.count({ where: { created_at: { gte: today } } }),
			this.prisma.carBooking.count({ where: { created_at: { gte: today } } }),
			this.prisma.hotelBooking.count({ where: { created_at: { gte: thisWeek } } }),
			this.prisma.carBooking.count({ where: { created_at: { gte: thisWeek } } }),
			this.prisma.hotelBooking.count({ where: { created_at: { gte: thisMonth } } }),
			this.prisma.carBooking.count({ where: { created_at: { gte: thisMonth } } }),
			this.prisma.hotelBooking.count(),
			this.prisma.carBooking.count(),
		]);

		const bookingsToday = hotelBookingsToday + carBookingsToday;
		const bookingsThisWeek = hotelBookingsThisWeek + carBookingsThisWeek;
		const bookingsThisMonth = hotelBookingsThisMonth + carBookingsThisMonth;
		const totalBookings = totalHotelBookings + totalCarBookings;

		// Revenue, disputes, and recent drivers - optimized parallel queries
		const [revenueResult, pendingDisputes, recentPendingDrivers] = await Promise.all([
			this.prisma.paymentTransaction.aggregate({
				where: { status: 'completed' },
				_sum: {
					amount: true,
					application_fee_amount: true,
				},
			}),
			this.prisma.dispute.count({ where: { status: 'pending' } }),
			this.prisma.driver.findMany({
				where: {
					is_verified: false,
					documents: { some: { status: 'pending' } },
				},
				include: {
					user: {
						select: {
							id: true,
							full_name: true,
							email: true,
							created_at: true,
						},
					},
				},
				orderBy: { created_at: 'desc' },
				take: 5,
			}),
		]);

		const totalRevenue = parseFloat(revenueResult._sum.amount?.toString() || '0');
		const totalCommission = parseFloat(revenueResult._sum.application_fee_amount?.toString() || '0');

		return {
			drivers: {
				total: totalDrivers,
				verified: verifiedDrivers,
				pending: pendingDrivers,
			},
			hotel_managers: {
				total: totalHotelManagers,
				verified: verifiedHotelManagers,
				pending: pendingHotelManagers,
			},
			bookings: {
				today: bookingsToday,
				this_week: bookingsThisWeek,
				this_month: bookingsThisMonth,
				total: totalBookings,
			},
			revenue: {
			total: totalRevenue,
			commission: totalCommission,
			currency: 'PKR',
			},
			disputes: {
				pending: pendingDisputes,
			},
			recent_pending_drivers: recentPendingDrivers.map((driver) => ({
				id: driver.id,
				user: driver.user,
				created_at: driver.created_at.toISOString(),
			})),
		};
	}

	/**
	 * Get all drivers with filters
	 */
	async getAllDrivers(filters: DriverFiltersDto) {
		const { page = 1, limit = 20, is_verified, city_id, status } = filters;

		const where: any = {};

		if (is_verified !== undefined) {
			where.is_verified = is_verified;
		}

		if (city_id) {
			where.user = {
				city_id: city_id,
			};
		}

		if (status === 'pending') {
			where.is_verified = false;
			where.documents = {
				some: { status: 'pending' },
			};
		} else if (status === 'verified') {
			where.is_verified = true;
		}

		const [drivers, total] = await Promise.all([
			this.prisma.driver.findMany({
				where,
				include: {
					user: {
						select: {
							id: true,
							full_name: true,
							email: true,
							status: true,
							city: {
								select: {
									id: true,
									name: true,
									region: true,
								},
							},
						},
					},
					cars: {
						select: {
							id: true,
							is_active: true,
						},
					},
					documents: {
						where: { status: 'pending' },
						take: 1,
					},
				},
				orderBy: { created_at: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
			}),
			this.prisma.driver.count({ where }),
		]);

		// Get dispute counts and suspension status for each driver
		const driversWithStats = await Promise.all(
			drivers.map(async (driver) => {
				// Get current period for dispute counting
				const { periodStart } = await this.getCurrentPeriod(driver.id);

				// Count disputes in current period
				const disputeCount = await this.prisma.dispute.count({
					where: {
						bookingCar: {
							car: { driver_id: driver.id },
						},
						created_at: { gte: periodStart },
					},
				});

				// Get current suspension status
				const currentSuspension = await this.prisma.driverDisciplinaryAction.findFirst({
					where: {
						driver_id: driver.id,
						action_type: { in: ['suspension', 'ban'] },
						actual_end: null,
					},
					orderBy: { created_at: 'desc' },
				});

				// Check for active ride
				const activeBooking = await this.prisma.carBooking.findFirst({
					where: {
						car: { driver_id: driver.id },
						status: 'IN_PROGRESS',
					},
					select: { id: true },
				});

				// Get all documents and ratings for this driver
				const [allDocuments, allRatings] = await Promise.all([
					this.prisma.driverDocument.findMany({
						where: { driver_id: driver.id },
						select: {
							id: true,
							document_type: true,
							status: true,
							uploaded_at: true,
						},
					}),
					this.prisma.driverRating.findMany({
						where: { driver_id: driver.id },
						select: {
							id: true,
							platform: true,
							rating: true,
							verified_at: true,
							screenshot_url: true,
						},
					}),
				]);

				return {
					id: driver.id,
					user: driver.user,
					is_verified: driver.is_verified,
					verification_notes: driver.verification_notes,
					verified_at: driver.verified_at?.toISOString() || null,
					cars_count: driver.cars.length,
					active_cars_count: driver.cars.filter((c) => c.is_active).length,
					has_pending_documents: allDocuments.some(d => d.status === 'pending'),
					documents: allDocuments.map((doc) => ({
						...doc,
						uploaded_at: doc.uploaded_at?.toISOString() || null,
					})),
					ratings: allRatings.map((rating) => ({
						...rating,
						verified_at: rating.verified_at?.toISOString() || null,
					})),
					created_at: driver.created_at.toISOString(),
					dispute_count: disputeCount,
					is_suspended: driver.user.status === AccountStatus.inactive,
					is_banned: driver.user.status === AccountStatus.banned,
					suspension_paused: currentSuspension?.is_paused || false,
					has_active_ride: !!activeBooking,
					last_warning_at: driver.last_warning_at?.toISOString() || null,
				};
			}),
		);

		return {
			data: driversWithStats,
			pagination: {
				page,
				limit,
				total,
				total_pages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Get driver details
	 */
	async getDriverDetails(driverId: number) {
		const driver = await this.prisma.driver.findUnique({
			where: { id: driverId },
			include: {
				user: {
					select: {
						id: true,
						full_name: true,
						email: true,
						status: true,
						city: {
							select: {
								id: true,
								name: true,
								region: true,
							},
						},
					},
				},
				cars: {
					include: {
						carModel: true,
						images: {
							orderBy: { display_order: 'asc' },
							take: 1,
						},
					},
				},
				documents: {
					orderBy: { uploaded_at: 'desc' },
				},
				ratings: {
					orderBy: { created_at: 'desc' },
				},
				currentSuspension: true,
				disciplinary_actions: {
					orderBy: { created_at: 'desc' },
				},
			},
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		// Get current period for dispute counting
		const { periodStart } = await this.getCurrentPeriod(driverId);

		// Count disputes in current period
		const disputeCount = await this.prisma.dispute.count({
			where: {
				bookingCar: {
					car: { driver_id: driverId },
				},
				created_at: { gte: periodStart },
			},
		});

		// Check for active ride
		const activeBooking = await this.prisma.carBooking.findFirst({
			where: {
				car: { driver_id: driverId },
				status: 'IN_PROGRESS',
			},
			select: { id: true },
		});

		return {
			...driver,
			dispute_count: disputeCount,
			is_suspended: driver.user.status === AccountStatus.inactive,
			is_banned: driver.user.status === AccountStatus.banned,
			suspension_paused: driver.currentSuspension?.is_paused || false,
			has_active_ride: !!activeBooking,
		};
	}

	/**
	 * Verify or reject driver
	 */
	async verifyDriver(driverId: number, dto: VerifyDriverDto, adminUserId: number) {
		const driver = await this.prisma.driver.findUnique({
			where: { id: driverId },
			include: { user: true },
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		// Use DriversService method (it already handles notifications)
		const result = await this.driversService.verifyDriver(driverId, dto);

		// Update reviewed_by for documents that were just reviewed (both approved and rejected)
		// We need to update documents that have reviewed_at set but reviewed_by is null
		// This happens when DriversService sets reviewed_at but not reviewed_by
		const recentlyReviewedDocs = await this.prisma.driverDocument.findMany({
			where: {
				driver_id: driverId,
				reviewed_by: null,
				reviewed_at: { not: null },
			},
		});

		if (recentlyReviewedDocs.length > 0) {
			await this.prisma.driverDocument.updateMany({
				where: {
					driver_id: driverId,
					reviewed_by: null,
					reviewed_at: { not: null },
				},
				data: {
					reviewed_by: adminUserId,
				},
			});
		}

		return result;
	}

	/**
	 * Reject driver verification
	 */
	async rejectDriver(driverId: number, reason: string, adminUserId: number) {
		const driver = await this.prisma.driver.findUnique({
			where: { id: driverId },
			include: { user: true },
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		await this.verifyDriver(
			driverId,
			{
				is_verified: false,
				verification_notes: reason,
			},
			adminUserId,
		);

		return {
			message: 'Driver verification rejected',
			driver_id: driverId,
		};
	}

	/**
	 * Suspend driver temporarily
	 * Admin can suspend driver anytime without dispute requirement
	 * Suspension is paused if driver has active ride
	 */
	async suspendDriver(driverId: number, dto: SuspendDriverDto) {
		const driver = await this.prisma.driver.findUnique({
			where: { id: driverId },
			include: { user: true },
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		// Check if already suspended or banned
		if (driver.user.status === AccountStatus.inactive) {
			throw new BadRequestException('Driver is already suspended');
		}

		if (driver.user.status === AccountStatus.banned) {
			throw new BadRequestException('Driver is banned and cannot be suspended');
		}

		// Check for active rides
		const { hasActiveRide, activeBookingId } = await this.checkActiveRides(driverId);

		// Get current period for tracking
		const { periodStart, periodEnd } = await this.getCurrentPeriod(driverId);

		if (hasActiveRide) {
			// Schedule suspension to start after ride completion
			const now = new Date();
			const scheduledStart = new Date(now);
			const scheduledEnd = new Date(now);
			scheduledEnd.setDate(scheduledEnd.getDate() + 3); // Default 3 days, admin can specify later

			const disciplinaryAction = await this.prisma.driverDisciplinaryAction.create({
				data: {
					driver_id: driverId,
					action_type: 'suspension',
					dispute_count: 0, // Manual suspension
					suspension_days: 3,
					scheduled_start: scheduledStart,
					scheduled_end: scheduledEnd,
					is_paused: true,
					pause_reason: `active_ride_booking_${activeBookingId}`,
					period_start: periodStart,
					period_end: periodEnd,
				},
			});

			await this.prisma.driver.update({
				where: { id: driverId },
				data: { current_suspension_id: disciplinaryAction.id },
			});

			await this.notificationsService.createNotification(
				driver.user_id,
				NotificationType.suspension_scheduled,
				'Account Suspension Scheduled',
				`Your account suspension has been scheduled but is paused due to an active ride. It will resume after your current trip completes. Reason: ${dto.reason}`,
			);

			return {
				message: 'Driver suspension scheduled (paused due to active ride)',
				driver_id: driverId,
				paused: true,
				active_booking_id: activeBookingId,
			};
		} else {
			// Apply suspension immediately
			await this.prisma.user.update({
				where: { id: driver.user_id },
				data: { status: AccountStatus.inactive },
			});

			// Deactivate all cars
			await this.prisma.car.updateMany({
				where: { driver_id: driverId },
				data: { is_active: false },
			});

			// Create disciplinary action record
			const now = new Date();
			const scheduledEnd = new Date(now);
			scheduledEnd.setDate(scheduledEnd.getDate() + 3);

			const disciplinaryAction = await this.prisma.driverDisciplinaryAction.create({
				data: {
					driver_id: driverId,
					action_type: 'suspension',
					dispute_count: 0,
					suspension_days: 3,
					scheduled_start: now,
					scheduled_end: scheduledEnd,
					actual_start: now,
					period_start: periodStart,
					period_end: periodEnd,
				},
			});

			await this.prisma.driver.update({
				where: { id: driverId },
				data: { current_suspension_id: disciplinaryAction.id },
			});

			// Send notification
			await this.notificationsService.createNotification(
				driver.user_id,
				NotificationType.suspension_started,
				'Account Suspended',
				`Your account has been temporarily suspended. Reason: ${dto.reason}`,
				{ driver_id: driverId },
			);

			return {
				message: 'Driver suspended successfully',
				driver_id: driverId,
			};
		}
	}

	/**
	 * Check if driver has any active rides (IN_PROGRESS bookings)
	 */
	private async checkActiveRides(driverId: number): Promise<{ hasActiveRide: boolean; activeBookingId?: number }> {
		const activeBooking = await this.prisma.carBooking.findFirst({
			where: {
				car: { driver_id: driverId },
				status: 'IN_PROGRESS',
			},
			select: { id: true },
		});

		return {
			hasActiveRide: !!activeBooking,
			activeBookingId: activeBooking?.id,
		};
	}

	/**
	 * Get current 3-month tracking period for a driver
	 */
	private async getCurrentPeriod(driverId: number): Promise<{ periodStart: Date; periodEnd: Date }> {
		// Get the most recent disciplinary action to determine current period
		const lastAction = await this.prisma.driverDisciplinaryAction.findFirst({
			where: { driver_id: driverId },
			orderBy: { period_start: 'desc' },
		});

		let periodStart: Date;
		if (lastAction && new Date(lastAction.period_end) > new Date()) {
			// Use existing period if not expired
			periodStart = new Date(lastAction.period_start);
		} else {
			// Start new period from today
			periodStart = new Date();
			periodStart.setHours(0, 0, 0, 0);
		}

		const periodEnd = new Date(periodStart);
		periodEnd.setMonth(periodEnd.getMonth() + 3);

		return { periodStart, periodEnd };
	}

	/**
	 * Count disputes in a specific period
	 */
	private async getDisputeCountInPeriod(driverId: number, periodStart: Date): Promise<number> {
		return this.prisma.dispute.count({
			where: {
				bookingCar: {
					car: { driver_id: driverId },
				},
				created_at: { gte: periodStart },
			},
		});
	}

	/**
	 * Reset period if expired and return new period
	 */
	private async resetPeriodIfExpired(driverId: number): Promise<{ periodStart: Date; periodEnd: Date; wasReset: boolean }> {
		const lastAction = await this.prisma.driverDisciplinaryAction.findFirst({
			where: { driver_id: driverId },
			orderBy: { period_start: 'desc' },
		});

		if (!lastAction || new Date(lastAction.period_end) <= new Date()) {
			// Period expired or no previous period, start new one
			const periodStart = new Date();
			periodStart.setHours(0, 0, 0, 0);
			const periodEnd = new Date(periodStart);
			periodEnd.setMonth(periodEnd.getMonth() + 3);

			// Reset driver's last warning
			await this.prisma.driver.update({
				where: { id: driverId },
				data: { last_warning_at: null },
			});

			return { periodStart, periodEnd, wasReset: true };
		}

		return {
			periodStart: new Date(lastAction.period_start),
			periodEnd: new Date(lastAction.period_end),
			wasReset: false,
		};
	}

	/**
	 * Schedule a suspension for a driver
	 */
	private async scheduleSuspension(
		driverId: number,
		days: number,
		disputeCount: number,
		periodStart: Date,
		periodEnd: Date,
		actionType: 'suspension' | 'ban' = 'suspension',
	): Promise<void> {
		const now = new Date();
		const scheduledStart = new Date(now);
		const scheduledEnd = new Date(now);
		scheduledEnd.setDate(scheduledEnd.getDate() + days);

		// Check for active ride
		const { hasActiveRide, activeBookingId } = await this.checkActiveRides(driverId);

		const disciplinaryAction = await this.prisma.driverDisciplinaryAction.create({
			data: {
				driver_id: driverId,
				action_type: actionType,
				dispute_count: disputeCount,
				suspension_days: actionType === 'suspension' ? days : null,
				scheduled_start: scheduledStart,
				scheduled_end: scheduledEnd,
				is_paused: hasActiveRide,
				pause_reason: hasActiveRide ? `active_ride_booking_${activeBookingId}` : null,
				period_start: periodStart,
				period_end: periodEnd,
			},
		});

		// Link to driver if this is the current suspension
		if (actionType === 'suspension') {
			await this.prisma.driver.update({
				where: { id: driverId },
				data: { current_suspension_id: disciplinaryAction.id },
			});
		}

		// Send notification
		if (hasActiveRide) {
			const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { user_id: true } });
			if (driver) {
				await this.notificationsService.createNotification(
					driver.user_id,
					NotificationType.suspension_paused,
					'Suspension Scheduled - Paused',
					`Your account suspension has been scheduled but is paused due to an active ride. It will resume after your current trip completes.`,
					{ driver_id: driverId },
				);
			}
		} else {
			await this.applyDisciplinaryAction(driverId, disciplinaryAction.id);
		}
	}

	/**
	 * Apply disciplinary action (suspension or ban) immediately
	 */
	private async applyDisciplinaryAction(driverId: number, actionId: number): Promise<void> {
		const driver = await this.prisma.driver.findUnique({
			where: { id: driverId },
			include: { user: true },
		});

		if (!driver) return;

		const action = await this.prisma.driverDisciplinaryAction.findUnique({
			where: { id: actionId },
		});

		if (!action) return;

		const now = new Date();

		// Update user status
		await this.prisma.user.update({
			where: { id: driver.user_id },
			data: { status: action.action_type === 'ban' ? AccountStatus.banned : AccountStatus.inactive },
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

		// Send notification
		await this.notificationsService.createNotification(
			driver.user_id,
			action.action_type === 'ban' ? NotificationType.ban_applied : NotificationType.suspension_started,
			action.action_type === 'ban' ? 'Account Banned' : 'Account Suspended',
			action.action_type === 'ban'
				? `Your account has been permanently banned due to ${action.dispute_count} disputes within the tracking period.`
				: `Your account has been suspended for ${action.suspension_days} days due to ${action.dispute_count} disputes.`,
			{ driver_id: driverId },
		);
	}

	/**
	 * Pause suspension if driver has active ride
	 */
	async pauseSuspensionIfActiveRide(driverId: number): Promise<boolean> {
		const { hasActiveRide, activeBookingId } = await this.checkActiveRides(driverId);

		if (!hasActiveRide) return false;

		const activeSuspension = await this.prisma.driverDisciplinaryAction.findFirst({
			where: {
				driver_id: driverId,
				action_type: { in: ['suspension', 'ban'] },
				actual_start: null,
				is_paused: false,
			},
			orderBy: { created_at: 'desc' },
		});

		if (activeSuspension) {
			await this.prisma.driverDisciplinaryAction.update({
				where: { id: activeSuspension.id },
				data: {
					is_paused: true,
					pause_reason: `active_ride_booking_${activeBookingId}`,
				},
			});

			const driver = await this.prisma.driver.findUnique({
				where: { id: driverId },
				select: { user_id: true },
			});

			if (driver) {
			await this.notificationsService.createNotification(
				driver.user_id,
				NotificationType.suspension_paused,
				'Suspension Paused',
				`Your account suspension has been paused due to an active ride. It will resume after your current trip completes.`,
				{ driver_id: driverId },
			);
			}

			return true;
		}

		return false;
	}

	/**
	 * Resume suspension after ride completes
	 */
	async resumeSuspensionAfterRide(driverId: number, bookingId: number): Promise<void> {
		const pausedActions = await this.prisma.driverDisciplinaryAction.findMany({
			where: {
				driver_id: driverId,
				action_type: { in: ['suspension', 'ban'] },
				is_paused: true,
				pause_reason: { contains: `booking_${bookingId}` },
			},
		});

		for (const action of pausedActions) {
			// Check if suspension period has passed
			const now = new Date();
			if (action.scheduled_end && new Date(action.scheduled_end) <= now) {
				// Suspension period expired while paused, mark as ended
				await this.prisma.driverDisciplinaryAction.update({
					where: { id: action.id },
					data: {
						actual_end: now,
						is_paused: false,
						pause_reason: null,
					},
				});

				// Reactivate driver if suspension ended
				if (action.action_type === 'suspension') {
					await this.prisma.user.update({
						where: { id: (await this.prisma.driver.findUnique({ where: { id: driverId }, select: { user_id: true } }))?.user_id || 0 },
						data: { status: AccountStatus.active },
					});

					await this.prisma.driver.update({
						where: { id: driverId },
						data: { current_suspension_id: null },
					});
				}
			} else {
				// Resume disciplinary action
				await this.applyDisciplinaryAction(driverId, action.id);
				await this.prisma.driverDisciplinaryAction.update({
					where: { id: action.id },
					data: {
						is_paused: false,
						pause_reason: null,
					},
				});

				const driver = await this.prisma.driver.findUnique({
					where: { id: driverId },
					select: { user_id: true },
				});

				if (driver) {
					await this.notificationsService.createNotification(
						driver.user_id,
						NotificationType.suspension_resumed,
						'Suspension Resumed',
						`Your account suspension has been resumed after your trip completion.`,
						{ driver_id: driverId },
					);
				}
			}
		}
	}

	/**
	 * Check and auto-suspend driver based on progressive penalty system
	 * This is called automatically when a dispute is created
	 */
	async checkAndAutoSuspendDriver(driverId: number): Promise<boolean> {
		const driver = await this.prisma.driver.findUnique({
			where: { id: driverId },
			include: { user: true },
		});

		if (!driver || driver.user.status !== AccountStatus.active) {
			return false; // Driver not found or already suspended/banned
		}

		// Reset period if expired
		const { periodStart, periodEnd, wasReset } = await this.resetPeriodIfExpired(driverId);

		// Count disputes in current period
		const disputeCount = await this.getDisputeCountInPeriod(driverId, periodStart);

		// Check for existing suspensions in current period
		const existingSuspension = await this.prisma.driverDisciplinaryAction.findFirst({
			where: {
				driver_id: driverId,
				action_type: { in: ['suspension', 'ban'] },
				period_start: periodStart,
				actual_end: null,
			},
		});

		// Progressive penalty system
		if (disputeCount >= 3 && !driver.last_warning_at) {
			// Send warning at 3 disputes (only once per period)
			await this.prisma.driver.update({
				where: { id: driverId },
				data: { last_warning_at: new Date() },
			});

			await this.prisma.driverDisciplinaryAction.create({
				data: {
					driver_id: driverId,
					action_type: 'warning',
					dispute_count: disputeCount,
					period_start: periodStart,
					period_end: periodEnd,
				},
			});

			await this.notificationsService.createNotification(
				driver.user_id,
				NotificationType.dispute_warning,
				'Dispute Warning',
				`You have received ${disputeCount} disputes. Please improve your service quality. Further disputes may result in account suspension.`,
			);
		}

		if (disputeCount >= 5 && !existingSuspension) {
			// First suspension: 3 days
			await this.scheduleSuspension(driverId, 3, disputeCount, periodStart, periodEnd, 'suspension');
			return true;
		}

		// Check if driver had a 3-day suspension in this period
		const hadThreeDaySuspension = await this.prisma.driverDisciplinaryAction.findFirst({
			where: {
				driver_id: driverId,
				action_type: 'suspension',
				suspension_days: 3,
				period_start: periodStart,
			},
		});

		if (disputeCount >= 7 && hadThreeDaySuspension && !existingSuspension) {
			// Second suspension: 7 days
			await this.scheduleSuspension(driverId, 7, disputeCount, periodStart, periodEnd, 'suspension');
			return true;
		}

		// Check if driver had a 7-day suspension in this period
		const hadSevenDaySuspension = await this.prisma.driverDisciplinaryAction.findFirst({
			where: {
				driver_id: driverId,
				action_type: 'suspension',
				suspension_days: 7,
				period_start: periodStart,
			},
		});

		if (disputeCount > 5 && hadSevenDaySuspension && !existingSuspension) {
			// Ban after 7-day suspension
			await this.scheduleSuspension(driverId, 0, disputeCount, periodStart, periodEnd, 'ban');
			return true;
		}

		return false;
	}

	/**
	 * Ban driver permanently
	 */
	async banDriver(driverId: number, dto: BanDriverDto) {
		const driver = await this.prisma.driver.findUnique({
			where: { id: driverId },
			include: { user: true },
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		if (driver.user.status === AccountStatus.banned) {
			throw new BadRequestException('Driver is already banned');
		}

		// Check for active rides
		const { hasActiveRide, activeBookingId } = await this.checkActiveRides(driverId);

		// Get current period for tracking
		const { periodStart, periodEnd } = await this.getCurrentPeriod(driverId);

		if (hasActiveRide) {
			// Schedule ban to start after ride completion
			const now = new Date();

			await this.prisma.driverDisciplinaryAction.create({
				data: {
					driver_id: driverId,
					action_type: 'ban',
					dispute_count: 0, // Manual ban
					scheduled_start: now,
					is_paused: true,
					pause_reason: `active_ride_booking_${activeBookingId}`,
					period_start: periodStart,
					period_end: periodEnd,
				},
			});

			await this.notificationsService.createNotification(
				driver.user_id,
				NotificationType.ban_scheduled,
				'Account Ban Scheduled',
				`Your account ban has been scheduled but is paused due to an active ride. It will be applied after your current trip completes. Reason: ${dto.reason}`,
				{ driver_id: driverId },
			);

			return {
				message: 'Driver ban scheduled (paused due to active ride)',
				driver_id: driverId,
				paused: true,
				active_booking_id: activeBookingId,
			};
		} else {
			// Apply ban immediately
			await this.prisma.user.update({
				where: { id: driver.user_id },
				data: { status: AccountStatus.banned },
			});

			// Deactivate all cars
			await this.prisma.car.updateMany({
				where: { driver_id: driverId },
				data: { is_active: false },
			});

			// Create disciplinary action record
			const now = new Date();

			await this.prisma.driverDisciplinaryAction.create({
				data: {
					driver_id: driverId,
					action_type: 'ban',
					dispute_count: 0,
					scheduled_start: now,
					actual_start: now,
					period_start: periodStart,
					period_end: periodEnd,
				},
			});

			// Send notification
			await this.notificationsService.createNotification(
				driver.user_id,
				NotificationType.ban_applied,
				'Account Banned',
				`Your account has been permanently banned. Reason: ${dto.reason}`,
				{ driver_id: driverId },
			);

			return {
				message: 'Driver banned successfully',
				driver_id: driverId,
			};
		}
	}

	/**
	 * Get all disputes
	 */
	async getAllDisputes(filters: DisputeFiltersDto) {
		const { page = 1, limit = 20, status, booking_type } = filters;

		const where: any = {};

		if (status) {
			where.status = status as DisputeStatus;
		}

		if (booking_type === 'hotel') {
			where.booking_hotel_id = { not: null };
		} else if (booking_type === 'car') {
			where.booking_car_id = { not: null };
		}

		const [disputes, total] = await Promise.all([
			this.prisma.dispute.findMany({
				where,
				include: {
					bookingHotel: {
						include: {
							user: {
								select: {
									id: true,
									full_name: true,
									email: true,
								},
							},
							hotel: {
								select: {
									id: true,
									name: true,
								},
							},
						},
					},
					bookingCar: {
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
					},
					attachments: true,
				},
				orderBy: { created_at: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
			}),
			this.prisma.dispute.count({ where }),
		]);

		return {
			data: disputes.map((dispute) => ({
				id: dispute.id,
				booking_type: dispute.booking_hotel_id ? 'hotel' : 'car',
				booking: dispute.booking_hotel_id
					? {
							id: dispute.bookingHotel?.id,
							customer: dispute.bookingHotel?.user,
							hotel: dispute.bookingHotel?.hotel,
						}
					: {
							id: dispute.bookingCar?.id,
							customer: dispute.bookingCar?.user,
							car: dispute.bookingCar?.car,
							driver: dispute.bookingCar?.car.driver.user,
						},
				raised_by: dispute.raised_by,
				description: dispute.description,
				status: dispute.status,
				attachments: dispute.attachments,
				created_at: dispute.created_at.toISOString(),
				resolved_at: dispute.resolved_at?.toISOString() || null,
			})),
			pagination: {
				page,
				limit,
				total,
				total_pages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Get dispute by ID
	 */
	async getDisputeById(disputeId: number) {
		const dispute = await this.prisma.dispute.findUnique({
			where: { id: disputeId },
			include: {
				bookingHotel: {
					include: {
						user: true,
						hotel: true,
					},
				},
				bookingCar: {
					include: {
						user: true,
						car: {
							include: {
								carModel: true,
								driver: {
									include: {
										user: true,
									},
								},
							},
						},
					},
				},
				attachments: true,
			},
		});

		if (!dispute) {
			throw new NotFoundException('Dispute not found');
		}

		return dispute;
	}

	/**
	 * Create a new dispute
	 * Auto-suspends driver if they reach 5+ pending disputes
	 */
	async createDispute(dto: any) {
		const { booking_hotel_id, booking_car_id, raised_by, description } = dto;

		// Validate that exactly one booking ID is provided
		if (!booking_hotel_id && !booking_car_id) {
			throw new BadRequestException('Either booking_hotel_id or booking_car_id must be provided');
		}

		if (booking_hotel_id && booking_car_id) {
			throw new BadRequestException('Cannot provide both booking_hotel_id and booking_car_id');
		}

		// Check if booking exists and get driver ID if it's a car booking
		let driverId: number | null = null;

		if (booking_car_id) {
			const carBooking = await this.prisma.carBooking.findUnique({
				where: { id: booking_car_id },
				include: {
					car: {
						include: {
							driver: true,
						},
					},
				},
			});

			if (!carBooking) {
				throw new NotFoundException('Car booking not found');
			}

			driverId = carBooking.car.driver_id;
		}

		// Check if dispute already exists for this booking
		const existingDispute = await this.prisma.dispute.findFirst({
			where: {
				OR: [
					{ booking_hotel_id: booking_hotel_id || undefined },
					{ booking_car_id: booking_car_id || undefined },
				],
			},
		});

		if (existingDispute) {
			throw new BadRequestException('A dispute already exists for this booking');
		}

		// Create dispute
		const dispute = await this.prisma.dispute.create({
			data: {
				booking_hotel_id: booking_hotel_id || null,
				booking_car_id: booking_car_id || null,
				raised_by,
				description,
				status: DisputeStatus.pending,
			},
			include: {
				bookingHotel: {
					include: { user: true },
				},
				bookingCar: {
					include: {
						user: true,
						car: {
							include: {
								driver: {
									include: { user: true },
								},
							},
						},
					},
				},
			},
		});

		// Check and auto-suspend driver if they have 5+ pending disputes
		if (driverId) {
			const wasAutoSuspended = await this.checkAndAutoSuspendDriver(driverId);
			if (wasAutoSuspended) {
				// Log auto-suspension event (could add to audit log later)
				console.log(`Driver ${driverId} auto-suspended due to 5+ pending disputes`);
			}
		}

		// Notify admin about new dispute
		// Get all admin users
		const admins = await this.prisma.user.findMany({
			where: { role: 'admin' },
			select: { id: true },
		});

		// Notify all admins
		for (const admin of admins) {
			await this.notificationsService.createNotification(
				admin.id,
				'dispute_raised',
				'New Dispute Raised',
				`A new dispute has been raised: ${description.substring(0, 100)}...`,
				{
					dispute_id: dispute.id,
					booking_type: booking_car_id ? 'car' : 'hotel',
					booking_id: booking_car_id || booking_hotel_id,
				},
			);
		}

		// Notify the other party (if client raised, notify driver; if driver raised, notify client)
		const otherPartyUserId = booking_car_id
			? dispute.bookingCar?.user_id
			: dispute.bookingHotel?.user_id;

		if (otherPartyUserId) {
			await this.notificationsService.createNotification(
				otherPartyUserId,
				'dispute_raised',
				'Dispute Raised Against You',
				`A dispute has been raised regarding your booking. Please review and respond.`,
				{
					dispute_id: dispute.id,
					booking_type: booking_car_id ? 'car' : 'hotel',
					booking_id: booking_car_id || booking_hotel_id,
				},
			);
		}

		return {
			message: 'Dispute created successfully',
			dispute: {
				id: dispute.id,
				booking_type: booking_car_id ? 'car' : 'hotel',
				raised_by: dispute.raised_by,
				description: dispute.description,
				status: dispute.status,
				created_at: dispute.created_at.toISOString(),
			},
		};
	}

	/**
	 * Resolve dispute
	 */
	async resolveDispute(disputeId: number, dto: ResolveDisputeDto) {
		const dispute = await this.prisma.dispute.findUnique({
			where: { id: disputeId },
			include: {
				bookingHotel: {
					include: { user: true },
				},
				bookingCar: {
					include: { user: true },
				},
			},
		});

		if (!dispute) {
			throw new NotFoundException('Dispute not found');
		}

		if (dispute.status !== DisputeStatus.pending) {
			throw new BadRequestException('Dispute is already resolved or rejected');
		}

		// Update dispute status
		const updatedDispute = await this.prisma.dispute.update({
			where: { id: disputeId },
			data: {
				status: DisputeStatus.resolved,
				resolved_at: new Date(),
			},
		});

		// TODO: Process refund in Phase 2 when payment integration is complete
		// if (dto.refund_amount && dto.refund_amount > 0) {
		//   await this.processRefund(dispute, dto.refund_amount);
		// }

		// Notify parties
		const customerUserId = dispute.booking_hotel_id
			? dispute.bookingHotel?.user_id
			: dispute.bookingCar?.user_id;

		if (customerUserId) {
			await this.notificationsService.createNotification(
				customerUserId,
				'dispute_resolved',
				'Dispute Resolved',
				`Your dispute has been resolved: ${dto.resolution}`,
				{
					dispute_id: disputeId,
					booking_type: dispute.booking_hotel_id ? 'hotel' : 'car',
					booking_id: dispute.booking_hotel_id || dispute.booking_car_id,
				},
			);
		}

		return {
			message: 'Dispute resolved successfully',
			dispute: updatedDispute,
		};
	}

	/**
	 * Get booking statistics
	 */
	async getBookingStats(dateRange?: { from?: Date; to?: Date }) {
		const where: any = {};

		if (dateRange?.from) {
			where.created_at = { gte: dateRange.from };
		}
		if (dateRange?.to) {
			where.created_at = {
				...where.created_at,
				lte: dateRange.to,
			};
		}

		const [hotelBookings, carBookings] = await Promise.all([
			this.prisma.hotelBooking.groupBy({
				by: ['status'],
				where,
				_count: true,
			}),
			this.prisma.carBooking.groupBy({
				by: ['status'],
				where,
				_count: true,
			}),
		]);

		return {
			hotel_bookings: hotelBookings.map((b) => ({
				status: b.status,
				count: b._count,
			})),
			car_bookings: carBookings.map((b) => ({
				status: b.status,
				count: b._count,
			})),
		};
	}

	/**
	 * Get driver performance statistics
	 */
	async getDriverPerformanceStats() {
		const drivers = await this.prisma.driver.findMany({
			where: { is_verified: true },
			include: {
				cars: {
					include: {
						carBookings: {
							where: {
								status: 'COMPLETED',
							},
						},
					},
				},
			},
		});

		const performance = drivers
			.map((driver) => {
				const totalBookings = driver.cars.reduce(
					(sum, car) => sum + car.carBookings.length,
					0,
				);
				const totalEarnings = driver.cars.reduce(
					(sum, car) =>
						sum +
						car.carBookings.reduce(
							(earnSum, booking) =>
								earnSum + parseFloat(booking.driver_earnings.toString()),
							0,
						),
					0,
				);

				return {
					driver_id: driver.id,
					user: {
						id: driver.user_id,
					},
					total_bookings: totalBookings,
					total_earnings: totalEarnings,
				};
			})
			.filter((p) => p.total_bookings > 0)
			.sort((a, b) => b.total_earnings - a.total_earnings)
			.slice(0, 10); // Top 10 drivers

		return performance;
	}

	/**
	 * Get driver disciplinary history
	 */
	async getDriverDisciplinaryHistory(driverId: number) {
		const driver = await this.prisma.driver.findUnique({
			where: { id: driverId },
			select: { id: true },
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		const actions = await this.prisma.driverDisciplinaryAction.findMany({
			where: { driver_id: driverId },
			orderBy: { created_at: 'desc' },
		});

		// Get dispute counts for each period
		const actionsWithDisputes = await Promise.all(
			actions.map(async (action) => {
				const disputeCount = await this.prisma.dispute.count({
					where: {
						bookingCar: {
							car: { driver_id: driverId },
						},
						created_at: {
							gte: new Date(action.period_start),
							lte: new Date(action.period_end),
						},
					},
				});

				return {
					...action,
					period_dispute_count: disputeCount,
				};
			}),
		);

		return actionsWithDisputes;
	}

	/**
	 * Get drivers with pending suspensions
	 */
	async getDriversWithPendingSuspensions() {
		const pendingActions = await this.prisma.driverDisciplinaryAction.findMany({
			where: {
				action_type: { in: ['suspension', 'ban'] },
				actual_start: null,
				is_paused: false,
			},
			include: {
				driver: {
					include: {
						user: {
							select: {
								id: true,
								full_name: true,
								email: true,
								status: true,
							},
						},
					},
				},
			},
			orderBy: { created_at: 'desc' },
		});

		// Also get drivers with active suspensions that are paused
		const pausedActions = await this.prisma.driverDisciplinaryAction.findMany({
			where: {
				action_type: { in: ['suspension', 'ban'] },
				is_paused: true,
			},
			include: {
				driver: {
					include: {
						user: {
							select: {
								id: true,
								full_name: true,
								email: true,
								status: true,
							},
						},
					},
				},
			},
			orderBy: { created_at: 'desc' },
		});

		return {
			pending: pendingActions.map((action) => ({
				driver_id: action.driver_id,
				driver_name: action.driver.user.full_name,
				driver_email: action.driver.user.email,
				action_type: action.action_type,
				dispute_count: action.dispute_count,
				scheduled_start: action.scheduled_start?.toISOString() || null,
				scheduled_end: action.scheduled_end?.toISOString() || null,
				suspension_days: action.suspension_days,
			})),
			paused: pausedActions.map((action) => ({
				driver_id: action.driver_id,
				driver_name: action.driver.user.full_name,
				driver_email: action.driver.user.email,
				action_type: action.action_type,
				dispute_count: action.dispute_count,
				pause_reason: action.pause_reason,
				scheduled_start: action.scheduled_start?.toISOString() || null,
				scheduled_end: action.scheduled_end?.toISOString() || null,
			})),
		};
	}

	/**
	 * Get revenue report
	 */
	async getRevenueReport(dateRange?: { from?: Date; to?: Date }) {
		const where: any = {
			status: 'completed',
		};

		if (dateRange?.from) {
			where.created_at = { gte: dateRange.from };
		}
		if (dateRange?.to) {
			where.created_at = {
				...where.created_at,
				lte: dateRange.to,
			};
		}

		const revenue = await this.prisma.paymentTransaction.aggregate({
			where,
			_sum: {
				amount: true,
				application_fee_amount: true,
			},
			_count: true,
		});

		return {
			total_revenue: parseFloat(revenue._sum.amount?.toString() || '0'),
			total_commission: parseFloat(revenue._sum.application_fee_amount?.toString() || '0'),
			total_transactions: revenue._count,
			currency: 'PKR',
		};
	}

	/**
	 * Get all users
	 */
	async getAllUsers(query: any = {}) {
		const { page = 1, limit = 20, role, status, city_id } = query;

		const where: any = {};

		if (role) {
			where.role = role;
		}

		if (status) {
			where.status = status;
		}

		if (city_id) {
			where.city_id = parseInt(city_id);
		}

		const [users, total] = await Promise.all([
			this.prisma.user.findMany({
				where,
				include: {
					city: {
						select: {
							id: true,
							name: true,
							region: true,
						},
					},
				},
				orderBy: { created_at: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
			}),
			this.prisma.user.count({ where }),
		]);

		return {
			data: users.map((user) => ({
				id: user.id,
				full_name: user.full_name,
				email: user.email,
				role: user.role,
				status: user.status,
				city: user.city,
				created_at: user.created_at.toISOString(),
			})),
			pagination: {
				page,
				limit,
				total,
				total_pages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Admin: Get all hotels (including unlisted/unverified manager hotels)
	 */
	async getAllHotels(query: any = {}) {
		const { page = 1, limit = 20, city_id, is_listed, is_active, manager_id } = query;

		const where: any = {};

		if (city_id) {
			where.city_id = parseInt(city_id);
		}

		if (is_listed !== undefined) {
			where.is_listed = is_listed === 'true';
		}

		if (is_active !== undefined) {
			where.is_active = is_active === 'true';
		}

		if (manager_id) {
			where.manager_id = parseInt(manager_id);
		}

		const [hotels, total] = await Promise.all([
			this.prisma.hotel.findMany({
				where,
				include: {
					city: { select: { id: true, name: true, region: true } },
					manager: {
						select: {
							id: true,
							is_verified: true,
							user: {
								select: {
									id: true,
									full_name: true,
									email: true,
								},
							},
						},
					},
					images: {
						orderBy: { display_order: 'asc' },
						take: 1,
					},
					roomTypes: {
						where: { is_active: true },
					},
					hotelBookings: {
						where: {
							status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
						},
						select: {
							id: true,
							total_amount: true,
						},
					},
				},
				orderBy: { created_at: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
			}),
			this.prisma.hotel.count({ where }),
		]);

		return {
			data: hotels.map(hotel => {
				const totalEarnings = hotel.hotelBookings.reduce(
					(sum, booking) => sum + parseFloat(booking.total_amount.toString()),
					0
				);
				return {
					id: hotel.id.toString(),
					name: hotel.name,
					description: hotel.description,
					location: hotel.city.name,
					address: hotel.address,
					rating: hotel.star_rating,
					is_active: hotel.is_active,
					is_listed: hotel.is_listed,
					manager: hotel.manager ? {
						id: hotel.manager.id,
						is_verified: hotel.manager.is_verified,
						name: hotel.manager.user.full_name,
						email: hotel.manager.user.email,
					} : null,
					images: hotel.images.map(img => img.image_url),
					room_types_count: hotel.roomTypes.length,
					total_bookings: hotel.hotelBookings.length,
					total_earnings: totalEarnings,
					created_at: hotel.created_at.toISOString(),
					updated_at: hotel.updated_at.toISOString(),
				};
			}),
			pagination: {
				page: parseInt(page),
				limit: parseInt(limit),
				total,
				total_pages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Admin: Get hotel details (can view any hotel)
	 */
	async getHotelDetails(id: number) {
		const hotel = await this.prisma.hotel.findUnique({
			where: { id },
			include: {
				city: { select: { id: true, name: true, region: true } },
				manager: {
					select: {
						id: true,
						is_verified: true,
						verified_at: true,
						user: {
							select: {
								id: true,
								full_name: true,
								email: true,
							},
						},
					},
				},
				images: { orderBy: { display_order: 'asc' } },
				roomTypes: {
					where: { is_active: true },
					orderBy: { base_price: 'asc' },
				},
				hotelBookings: {
					select: {
						id: true,
						status: true,
						total_amount: true,
						created_at: true,
					},
					orderBy: { created_at: 'desc' },
					take: 10,
				},
			},
		});

		if (!hotel) {
			throw new NotFoundException('Hotel not found');
		}

		return {
			id: hotel.id.toString(),
			name: hotel.name,
			description: hotel.description,
			location: hotel.city.name,
			address: hotel.address,
			rating: hotel.star_rating,
			amenities: (hotel.amenities as string[]) || [],
			is_active: hotel.is_active,
			is_listed: hotel.is_listed,
			manager: hotel.manager ? {
				id: hotel.manager.id,
				is_verified: hotel.manager.is_verified,
				verified_at: hotel.manager.verified_at?.toISOString() || null,
				name: hotel.manager.user.full_name,
				email: hotel.manager.user.email,
			} : null,
			images: hotel.images.map(img => ({
				id: img.id,
				url: img.image_url,
				display_order: img.display_order,
			})),
			roomTypes: hotel.roomTypes.map(rt => ({
				id: rt.id.toString(),
				name: rt.name,
				description: rt.description,
				capacity: rt.max_occupancy,
				total_rooms: rt.total_rooms,
				pricePerNight: parseFloat(rt.base_price.toString()),
				amenities: (rt.amenities as string[]) || [],
			})),
			recent_bookings: hotel.hotelBookings.map(booking => ({
				id: booking.id,
				status: booking.status,
				total_amount: parseFloat(booking.total_amount.toString()),
				created_at: booking.created_at.toISOString(),
			})),
			created_at: hotel.created_at.toISOString(),
			updated_at: hotel.updated_at.toISOString(),
		};
	}

	/**
	 * Admin: Update any hotel
	 */
	async updateHotel(id: number, data: any) {
		const hotel = await this.prisma.hotel.findUnique({ where: { id } });

		if (!hotel) {
			throw new NotFoundException('Hotel not found');
		}

		const updated = await this.prisma.hotel.update({
			where: { id },
			data: {
				name: data.name,
				description: data.description,
				address: data.address,
				star_rating: data.star_rating,
				amenities: data.amenities,
				is_active: data.is_active !== undefined ? data.is_active : hotel.is_active,
				is_listed: data.is_listed !== undefined ? data.is_listed : hotel.is_listed,
			},
		});

		return {
			id: updated.id,
			name: updated.name,
			message: 'Hotel updated successfully',
		};
	}

	/**
	 * Admin: Delete any hotel
	 */
	async deleteHotel(id: number) {
		const hotel = await this.prisma.hotel.findUnique({ where: { id } });

		if (!hotel) {
			throw new NotFoundException('Hotel not found');
		}

		await this.prisma.hotel.update({
			where: { id },
			data: { is_active: false },
		});

		return { message: 'Hotel deactivated successfully' };
	}

	/**
	 * Get all hotel managers with filters
	 */
	async getAllHotelManagers(query: any = {}) {
		const { page = 1, limit = 20, is_verified, city_id } = query;

		const where: any = {};

		if (is_verified !== undefined) {
			where.is_verified = is_verified === 'true';
		}

		if (city_id) {
			where.user = {
				city_id: parseInt(city_id),
			};
		}

		const [hotelManagers, total] = await Promise.all([
			this.prisma.hotelManager.findMany({
				where,
				include: {
					user: {
						select: {
							id: true,
							email: true,
							full_name: true,
							status: true,
							city: true,
						},
					},
					hotels: {
						select: {
							id: true,
							name: true,
							is_active: true,
							is_listed: true,
						},
					},
					documents: {
						orderBy: { uploaded_at: 'desc' },
					},
				},
				orderBy: { created_at: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
			}),
			this.prisma.hotelManager.count({ where }),
		]);

		return {
			data: hotelManagers.map(manager => ({
				id: manager.id,
				user: manager.user,
				is_verified: manager.is_verified,
				verification_notes: manager.verification_notes,
				verified_at: manager.verified_at?.toISOString() || null,
				hotels_count: manager.hotels.length,
				active_hotels_count: manager.hotels.filter(h => h.is_active && h.is_listed).length,
				has_pending_documents: manager.documents.some(d => d.status === 'pending'),
				documents: manager.documents.map(doc => ({
					id: doc.id,
					document_type: doc.document_type,
					status: doc.status,
					uploaded_at: doc.uploaded_at?.toISOString() || null,
					reviewed_at: doc.reviewed_at?.toISOString() || null,
				})),
				created_at: manager.created_at.toISOString(),
			})),
			pagination: {
				page: parseInt(page),
				limit: parseInt(limit),
				total,
				total_pages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Get hotel manager details
	 */
	async getHotelManagerDetails(managerId: number) {
		const hotelManager = await this.prisma.hotelManager.findUnique({
			where: { id: managerId },
			include: {
				user: {
					select: {
						id: true,
						email: true,
						full_name: true,
						status: true,
						city: true,
						created_at: true,
					},
				},
				hotels: {
					include: {
						city: { select: { id: true, name: true, region: true } },
						images: {
							orderBy: { display_order: 'asc' },
							take: 1,
						},
						roomTypes: {
							where: { is_active: true },
						},
						hotelBookings: {
							where: {
								status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
							},
							select: {
								id: true,
								total_amount: true,
							},
						},
					},
				},
				documents: {
					orderBy: { uploaded_at: 'desc' },
					include: {
						reviewer: {
							select: {
								id: true,
								full_name: true,
								email: true,
							},
						},
					},
				},
			},
		});

		if (!hotelManager) {
			throw new NotFoundException('Hotel manager not found');
		}

		return {
			id: hotelManager.id,
			user: hotelManager.user,
			is_verified: hotelManager.is_verified,
			verification_notes: hotelManager.verification_notes,
			verified_at: hotelManager.verified_at?.toISOString() || null,
			stripe_account_id: hotelManager.stripe_account_id,
			hotels: hotelManager.hotels.map(hotel => {
				const totalEarnings = hotel.hotelBookings.reduce(
					(sum, booking) => sum + parseFloat(booking.total_amount.toString()),
					0
				);
				return {
					id: hotel.id,
					name: hotel.name,
					city: hotel.city.name,
					is_active: hotel.is_active,
					is_listed: hotel.is_listed,
					room_types_count: hotel.roomTypes.length,
					total_bookings: hotel.hotelBookings.length,
					total_earnings: totalEarnings,
					image: hotel.images[0]?.image_url || null,
				};
			}),
			documents: hotelManager.documents.map(doc => ({
				id: doc.id,
				document_type: doc.document_type,
				document_url: doc.document_url,
				status: doc.status,
				rejection_reason: doc.rejection_reason,
				uploaded_at: doc.uploaded_at?.toISOString() || null,
				reviewed_at: doc.reviewed_at?.toISOString() || null,
				reviewer: doc.reviewer,
			})),
			created_at: hotelManager.created_at.toISOString(),
			updated_at: hotelManager.updated_at.toISOString(),
		};
	}

	/**
	 * Verify or reject hotel manager
	 */
	async verifyHotelManager(managerId: number, dto: VerifyHotelManagerDto) {
		const hotelManager = await this.prisma.hotelManager.findUnique({
			where: { id: managerId },
			include: {
				user: {
					select: {
						id: true,
						email: true,
						full_name: true,
					},
				},
			},
		});

		if (!hotelManager) {
			throw new NotFoundException('Hotel manager not found');
		}

		const updatedManager = await this.prisma.hotelManager.update({
			where: { id: managerId },
			data: {
				is_verified: dto.is_verified,
				verification_notes: dto.verification_notes || null,
				verified_at: dto.is_verified ? new Date() : null,
			},
		});

		// Update all pending documents to approved if verified
		if (dto.is_verified) {
			await this.prisma.hotelManagerDocument.updateMany({
				where: {
					hotel_manager_id: managerId,
					status: 'pending',
				},
				data: {
					status: 'approved',
					reviewed_at: new Date(),
				},
			});
		} else {
			// Reject all pending documents if manager verification is rejected
			await this.prisma.hotelManagerDocument.updateMany({
				where: {
					hotel_manager_id: managerId,
					status: 'pending',
				},
				data: {
					status: 'rejected',
					rejection_reason: dto.verification_notes || 'Verification rejected by admin',
					reviewed_at: new Date(),
				},
			});
		}

		// Send notification
		if (dto.is_verified) {
			await this.notificationsService.notifyHotelManagerVerificationApproved(
				hotelManager.user.id,
				hotelManager.user.full_name,
			);
		} else {
			await this.notificationsService.notifyHotelManagerVerificationRejected(
				hotelManager.user.id,
				hotelManager.user.full_name,
				dto.verification_notes || 'Verification rejected',
			);
		}

		return {
			message: dto.is_verified ? 'Hotel manager verified successfully' : 'Hotel manager verification rejected',
			hotel_manager: updatedManager,
		};
	}

	/**
	 * Update reviewed_by for hotel manager documents after verification/rejection
	 */
	async updateDocumentReviewer(managerId: number, adminUserId: number) {
		await this.prisma.hotelManagerDocument.updateMany({
			where: {
				hotel_manager_id: managerId,
				reviewed_by: null,
				reviewed_at: { not: null }, // Only update if reviewed_at is set (meaning it was just reviewed)
			},
			data: {
				reviewed_by: adminUserId,
			},
		});
	}

	/**
	 * Get pending hotel managers
	 */
	async getPendingHotelManagers() {
		return this.prisma.hotelManager.findMany({
			where: {
				is_verified: false,
				documents: {
					some: {
						status: 'pending',
					},
				},
			},
			include: {
				user: {
					select: {
						id: true,
						email: true,
						full_name: true,
						status: true,
						city: true,
					},
				},
				documents: {
					where: { status: 'pending' },
					orderBy: { uploaded_at: 'desc' },
				},
			},
			orderBy: {
				created_at: 'desc',
			},
		});
	}

	/**
	 * Get verified hotel managers
	 */
	async getVerifiedHotelManagers() {
		return this.prisma.hotelManager.findMany({
			where: { is_verified: true },
			include: {
				user: {
					select: {
						id: true,
						email: true,
						full_name: true,
						status: true,
						city: true,
					},
				},
				hotels: {
					include: {
						city: { select: { id: true, name: true } },
						images: {
							orderBy: { display_order: 'asc' },
							take: 1,
						},
					},
				},
				documents: {
					where: { status: 'approved' },
					orderBy: { uploaded_at: 'desc' },
				},
			},
			orderBy: {
				verified_at: 'desc',
			},
		});
	}
}
