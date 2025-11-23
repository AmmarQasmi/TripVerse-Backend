"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const drivers_service_1 = require("../drivers/drivers.service");
const notifications_service_1 = require("../common/services/notifications.service");
const client_1 = require("@prisma/client");
let AdminService = class AdminService {
    constructor(prisma, driversService, notificationsService) {
        this.prisma = prisma;
        this.driversService = driversService;
        this.notificationsService = notificationsService;
    }
    async getDashboardStats() {
        var _a, _b;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thisWeek = new Date(today);
        thisWeek.setDate(today.getDate() - 7);
        const thisMonth = new Date(today);
        thisMonth.setMonth(today.getMonth() - 1);
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
        const [hotelBookingsToday, carBookingsToday, hotelBookingsThisWeek, carBookingsThisWeek, hotelBookingsThisMonth, carBookingsThisMonth, totalHotelBookings, totalCarBookings,] = await Promise.all([
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
        const totalRevenue = parseFloat(((_a = revenueResult._sum.amount) === null || _a === void 0 ? void 0 : _a.toString()) || '0');
        const totalCommission = parseFloat(((_b = revenueResult._sum.application_fee_amount) === null || _b === void 0 ? void 0 : _b.toString()) || '0');
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
                currency: 'USD',
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
    async getAllDrivers(filters) {
        const { page = 1, limit = 20, is_verified, city_id, status } = filters;
        const where = {};
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
        }
        else if (status === 'verified') {
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
        const driversWithStats = await Promise.all(drivers.map(async (driver) => {
            var _a, _b;
            const { periodStart } = await this.getCurrentPeriod(driver.id);
            const disputeCount = await this.prisma.dispute.count({
                where: {
                    bookingCar: {
                        car: { driver_id: driver.id },
                    },
                    created_at: { gte: periodStart },
                },
            });
            const currentSuspension = await this.prisma.driverDisciplinaryAction.findFirst({
                where: {
                    driver_id: driver.id,
                    action_type: { in: ['suspension', 'ban'] },
                    actual_end: null,
                },
                orderBy: { created_at: 'desc' },
            });
            const activeBooking = await this.prisma.carBooking.findFirst({
                where: {
                    car: { driver_id: driver.id },
                    status: 'IN_PROGRESS',
                },
                select: { id: true },
            });
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
                verified_at: ((_a = driver.verified_at) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                cars_count: driver.cars.length,
                active_cars_count: driver.cars.filter((c) => c.is_active).length,
                has_pending_documents: allDocuments.some(d => d.status === 'pending'),
                documents: allDocuments.map((doc) => {
                    var _a;
                    return ({
                        ...doc,
                        uploaded_at: ((_a = doc.uploaded_at) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                    });
                }),
                ratings: allRatings.map((rating) => {
                    var _a;
                    return ({
                        ...rating,
                        verified_at: ((_a = rating.verified_at) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                    });
                }),
                created_at: driver.created_at.toISOString(),
                dispute_count: disputeCount,
                is_suspended: driver.user.status === client_1.AccountStatus.inactive,
                is_banned: driver.user.status === client_1.AccountStatus.banned,
                suspension_paused: (currentSuspension === null || currentSuspension === void 0 ? void 0 : currentSuspension.is_paused) || false,
                has_active_ride: !!activeBooking,
                last_warning_at: ((_b = driver.last_warning_at) === null || _b === void 0 ? void 0 : _b.toISOString()) || null,
            };
        }));
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
    async getDriverDetails(driverId) {
        var _a;
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
            throw new common_1.NotFoundException('Driver not found');
        }
        const { periodStart } = await this.getCurrentPeriod(driverId);
        const disputeCount = await this.prisma.dispute.count({
            where: {
                bookingCar: {
                    car: { driver_id: driverId },
                },
                created_at: { gte: periodStart },
            },
        });
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
            is_suspended: driver.user.status === client_1.AccountStatus.inactive,
            is_banned: driver.user.status === client_1.AccountStatus.banned,
            suspension_paused: ((_a = driver.currentSuspension) === null || _a === void 0 ? void 0 : _a.is_paused) || false,
            has_active_ride: !!activeBooking,
        };
    }
    async verifyDriver(driverId, dto, adminUserId) {
        const driver = await this.prisma.driver.findUnique({
            where: { id: driverId },
            include: { user: true },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver not found');
        }
        const result = await this.driversService.verifyDriver(driverId, dto);
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
    async rejectDriver(driverId, reason, adminUserId) {
        const driver = await this.prisma.driver.findUnique({
            where: { id: driverId },
            include: { user: true },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver not found');
        }
        await this.verifyDriver(driverId, {
            is_verified: false,
            verification_notes: reason,
        }, adminUserId);
        return {
            message: 'Driver verification rejected',
            driver_id: driverId,
        };
    }
    async suspendDriver(driverId, dto) {
        const driver = await this.prisma.driver.findUnique({
            where: { id: driverId },
            include: { user: true },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver not found');
        }
        if (driver.user.status === client_1.AccountStatus.inactive) {
            throw new common_1.BadRequestException('Driver is already suspended');
        }
        if (driver.user.status === client_1.AccountStatus.banned) {
            throw new common_1.BadRequestException('Driver is banned and cannot be suspended');
        }
        const { hasActiveRide, activeBookingId } = await this.checkActiveRides(driverId);
        const { periodStart, periodEnd } = await this.getCurrentPeriod(driverId);
        if (hasActiveRide) {
            const now = new Date();
            const scheduledStart = new Date(now);
            const scheduledEnd = new Date(now);
            scheduledEnd.setDate(scheduledEnd.getDate() + 3);
            const disciplinaryAction = await this.prisma.driverDisciplinaryAction.create({
                data: {
                    driver_id: driverId,
                    action_type: 'suspension',
                    dispute_count: 0,
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
            await this.notificationsService.createNotification(driver.user_id, client_1.NotificationType.suspension_scheduled, 'Account Suspension Scheduled', `Your account suspension has been scheduled but is paused due to an active ride. It will resume after your current trip completes. Reason: ${dto.reason}`);
            return {
                message: 'Driver suspension scheduled (paused due to active ride)',
                driver_id: driverId,
                paused: true,
                active_booking_id: activeBookingId,
            };
        }
        else {
            await this.prisma.user.update({
                where: { id: driver.user_id },
                data: { status: client_1.AccountStatus.inactive },
            });
            await this.prisma.car.updateMany({
                where: { driver_id: driverId },
                data: { is_active: false },
            });
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
            await this.notificationsService.createNotification(driver.user_id, client_1.NotificationType.suspension_started, 'Account Suspended', `Your account has been temporarily suspended. Reason: ${dto.reason}`);
            return {
                message: 'Driver suspended successfully',
                driver_id: driverId,
            };
        }
    }
    async checkActiveRides(driverId) {
        const activeBooking = await this.prisma.carBooking.findFirst({
            where: {
                car: { driver_id: driverId },
                status: 'IN_PROGRESS',
            },
            select: { id: true },
        });
        return {
            hasActiveRide: !!activeBooking,
            activeBookingId: activeBooking === null || activeBooking === void 0 ? void 0 : activeBooking.id,
        };
    }
    async getCurrentPeriod(driverId) {
        const lastAction = await this.prisma.driverDisciplinaryAction.findFirst({
            where: { driver_id: driverId },
            orderBy: { period_start: 'desc' },
        });
        let periodStart;
        if (lastAction && new Date(lastAction.period_end) > new Date()) {
            periodStart = new Date(lastAction.period_start);
        }
        else {
            periodStart = new Date();
            periodStart.setHours(0, 0, 0, 0);
        }
        const periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodEnd.getMonth() + 3);
        return { periodStart, periodEnd };
    }
    async getDisputeCountInPeriod(driverId, periodStart) {
        return this.prisma.dispute.count({
            where: {
                bookingCar: {
                    car: { driver_id: driverId },
                },
                created_at: { gte: periodStart },
            },
        });
    }
    async resetPeriodIfExpired(driverId) {
        const lastAction = await this.prisma.driverDisciplinaryAction.findFirst({
            where: { driver_id: driverId },
            orderBy: { period_start: 'desc' },
        });
        if (!lastAction || new Date(lastAction.period_end) <= new Date()) {
            const periodStart = new Date();
            periodStart.setHours(0, 0, 0, 0);
            const periodEnd = new Date(periodStart);
            periodEnd.setMonth(periodEnd.getMonth() + 3);
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
    async scheduleSuspension(driverId, days, disputeCount, periodStart, periodEnd, actionType = 'suspension') {
        const now = new Date();
        const scheduledStart = new Date(now);
        const scheduledEnd = new Date(now);
        scheduledEnd.setDate(scheduledEnd.getDate() + days);
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
        if (actionType === 'suspension') {
            await this.prisma.driver.update({
                where: { id: driverId },
                data: { current_suspension_id: disciplinaryAction.id },
            });
        }
        if (hasActiveRide) {
            const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { user_id: true } });
            if (driver) {
                await this.notificationsService.createNotification(driver.user_id, client_1.NotificationType.suspension_paused, 'Suspension Scheduled - Paused', `Your account suspension has been scheduled but is paused due to an active ride. It will resume after your current trip completes.`);
            }
        }
        else {
            await this.applyDisciplinaryAction(driverId, disciplinaryAction.id);
        }
    }
    async applyDisciplinaryAction(driverId, actionId) {
        const driver = await this.prisma.driver.findUnique({
            where: { id: driverId },
            include: { user: true },
        });
        if (!driver)
            return;
        const action = await this.prisma.driverDisciplinaryAction.findUnique({
            where: { id: actionId },
        });
        if (!action)
            return;
        const now = new Date();
        await this.prisma.user.update({
            where: { id: driver.user_id },
            data: { status: action.action_type === 'ban' ? client_1.AccountStatus.banned : client_1.AccountStatus.inactive },
        });
        await this.prisma.car.updateMany({
            where: { driver_id: driverId },
            data: { is_active: false },
        });
        await this.prisma.driverDisciplinaryAction.update({
            where: { id: actionId },
            data: { actual_start: now },
        });
        await this.notificationsService.createNotification(driver.user_id, action.action_type === 'ban' ? client_1.NotificationType.ban_applied : client_1.NotificationType.suspension_started, action.action_type === 'ban' ? 'Account Banned' : 'Account Suspended', action.action_type === 'ban'
            ? `Your account has been permanently banned due to ${action.dispute_count} disputes within the tracking period.`
            : `Your account has been suspended for ${action.suspension_days} days due to ${action.dispute_count} disputes.`);
    }
    async pauseSuspensionIfActiveRide(driverId) {
        const { hasActiveRide, activeBookingId } = await this.checkActiveRides(driverId);
        if (!hasActiveRide)
            return false;
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
                await this.notificationsService.createNotification(driver.user_id, client_1.NotificationType.suspension_paused, 'Suspension Paused', `Your account suspension has been paused due to an active ride. It will resume after your current trip completes.`);
            }
            return true;
        }
        return false;
    }
    async resumeSuspensionAfterRide(driverId, bookingId) {
        var _a;
        const pausedActions = await this.prisma.driverDisciplinaryAction.findMany({
            where: {
                driver_id: driverId,
                action_type: { in: ['suspension', 'ban'] },
                is_paused: true,
                pause_reason: { contains: `booking_${bookingId}` },
            },
        });
        for (const action of pausedActions) {
            const now = new Date();
            if (action.scheduled_end && new Date(action.scheduled_end) <= now) {
                await this.prisma.driverDisciplinaryAction.update({
                    where: { id: action.id },
                    data: {
                        actual_end: now,
                        is_paused: false,
                        pause_reason: null,
                    },
                });
                if (action.action_type === 'suspension') {
                    await this.prisma.user.update({
                        where: { id: ((_a = (await this.prisma.driver.findUnique({ where: { id: driverId }, select: { user_id: true } }))) === null || _a === void 0 ? void 0 : _a.user_id) || 0 },
                        data: { status: client_1.AccountStatus.active },
                    });
                    await this.prisma.driver.update({
                        where: { id: driverId },
                        data: { current_suspension_id: null },
                    });
                }
            }
            else {
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
                    await this.notificationsService.createNotification(driver.user_id, client_1.NotificationType.suspension_resumed, 'Suspension Resumed', `Your account suspension has been resumed after your trip completion.`);
                }
            }
        }
    }
    async checkAndAutoSuspendDriver(driverId) {
        const driver = await this.prisma.driver.findUnique({
            where: { id: driverId },
            include: { user: true },
        });
        if (!driver || driver.user.status !== client_1.AccountStatus.active) {
            return false;
        }
        const { periodStart, periodEnd, wasReset } = await this.resetPeriodIfExpired(driverId);
        const disputeCount = await this.getDisputeCountInPeriod(driverId, periodStart);
        const existingSuspension = await this.prisma.driverDisciplinaryAction.findFirst({
            where: {
                driver_id: driverId,
                action_type: { in: ['suspension', 'ban'] },
                period_start: periodStart,
                actual_end: null,
            },
        });
        if (disputeCount >= 3 && !driver.last_warning_at) {
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
            await this.notificationsService.createNotification(driver.user_id, client_1.NotificationType.dispute_warning, 'Dispute Warning', `You have received ${disputeCount} disputes. Please improve your service quality. Further disputes may result in account suspension.`);
        }
        if (disputeCount >= 5 && !existingSuspension) {
            await this.scheduleSuspension(driverId, 3, disputeCount, periodStart, periodEnd, 'suspension');
            return true;
        }
        const hadThreeDaySuspension = await this.prisma.driverDisciplinaryAction.findFirst({
            where: {
                driver_id: driverId,
                action_type: 'suspension',
                suspension_days: 3,
                period_start: periodStart,
            },
        });
        if (disputeCount >= 7 && hadThreeDaySuspension && !existingSuspension) {
            await this.scheduleSuspension(driverId, 7, disputeCount, periodStart, periodEnd, 'suspension');
            return true;
        }
        const hadSevenDaySuspension = await this.prisma.driverDisciplinaryAction.findFirst({
            where: {
                driver_id: driverId,
                action_type: 'suspension',
                suspension_days: 7,
                period_start: periodStart,
            },
        });
        if (disputeCount > 5 && hadSevenDaySuspension && !existingSuspension) {
            await this.scheduleSuspension(driverId, 0, disputeCount, periodStart, periodEnd, 'ban');
            return true;
        }
        return false;
    }
    async banDriver(driverId, dto) {
        const driver = await this.prisma.driver.findUnique({
            where: { id: driverId },
            include: { user: true },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver not found');
        }
        if (driver.user.status === client_1.AccountStatus.banned) {
            throw new common_1.BadRequestException('Driver is already banned');
        }
        const { hasActiveRide, activeBookingId } = await this.checkActiveRides(driverId);
        const { periodStart, periodEnd } = await this.getCurrentPeriod(driverId);
        if (hasActiveRide) {
            const now = new Date();
            await this.prisma.driverDisciplinaryAction.create({
                data: {
                    driver_id: driverId,
                    action_type: 'ban',
                    dispute_count: 0,
                    scheduled_start: now,
                    is_paused: true,
                    pause_reason: `active_ride_booking_${activeBookingId}`,
                    period_start: periodStart,
                    period_end: periodEnd,
                },
            });
            await this.notificationsService.createNotification(driver.user_id, client_1.NotificationType.ban_scheduled, 'Account Ban Scheduled', `Your account ban has been scheduled but is paused due to an active ride. It will be applied after your current trip completes. Reason: ${dto.reason}`);
            return {
                message: 'Driver ban scheduled (paused due to active ride)',
                driver_id: driverId,
                paused: true,
                active_booking_id: activeBookingId,
            };
        }
        else {
            await this.prisma.user.update({
                where: { id: driver.user_id },
                data: { status: client_1.AccountStatus.banned },
            });
            await this.prisma.car.updateMany({
                where: { driver_id: driverId },
                data: { is_active: false },
            });
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
            await this.notificationsService.createNotification(driver.user_id, client_1.NotificationType.ban_applied, 'Account Banned', `Your account has been permanently banned. Reason: ${dto.reason}`);
            return {
                message: 'Driver banned successfully',
                driver_id: driverId,
            };
        }
    }
    async getAllDisputes(filters) {
        const { page = 1, limit = 20, status, booking_type } = filters;
        const where = {};
        if (status) {
            where.status = status;
        }
        if (booking_type === 'hotel') {
            where.booking_hotel_id = { not: null };
        }
        else if (booking_type === 'car') {
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
            data: disputes.map((dispute) => {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                return ({
                    id: dispute.id,
                    booking_type: dispute.booking_hotel_id ? 'hotel' : 'car',
                    booking: dispute.booking_hotel_id
                        ? {
                            id: (_a = dispute.bookingHotel) === null || _a === void 0 ? void 0 : _a.id,
                            customer: (_b = dispute.bookingHotel) === null || _b === void 0 ? void 0 : _b.user,
                            hotel: (_c = dispute.bookingHotel) === null || _c === void 0 ? void 0 : _c.hotel,
                        }
                        : {
                            id: (_d = dispute.bookingCar) === null || _d === void 0 ? void 0 : _d.id,
                            customer: (_e = dispute.bookingCar) === null || _e === void 0 ? void 0 : _e.user,
                            car: (_f = dispute.bookingCar) === null || _f === void 0 ? void 0 : _f.car,
                            driver: (_g = dispute.bookingCar) === null || _g === void 0 ? void 0 : _g.car.driver.user,
                        },
                    raised_by: dispute.raised_by,
                    description: dispute.description,
                    status: dispute.status,
                    attachments: dispute.attachments,
                    created_at: dispute.created_at.toISOString(),
                    resolved_at: ((_h = dispute.resolved_at) === null || _h === void 0 ? void 0 : _h.toISOString()) || null,
                });
            }),
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit),
            },
        };
    }
    async getDisputeById(disputeId) {
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
            throw new common_1.NotFoundException('Dispute not found');
        }
        return dispute;
    }
    async createDispute(dto) {
        var _a, _b;
        const { booking_hotel_id, booking_car_id, raised_by, description } = dto;
        if (!booking_hotel_id && !booking_car_id) {
            throw new common_1.BadRequestException('Either booking_hotel_id or booking_car_id must be provided');
        }
        if (booking_hotel_id && booking_car_id) {
            throw new common_1.BadRequestException('Cannot provide both booking_hotel_id and booking_car_id');
        }
        let driverId = null;
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
                throw new common_1.NotFoundException('Car booking not found');
            }
            driverId = carBooking.car.driver_id;
        }
        const existingDispute = await this.prisma.dispute.findFirst({
            where: {
                OR: [
                    { booking_hotel_id: booking_hotel_id || undefined },
                    { booking_car_id: booking_car_id || undefined },
                ],
            },
        });
        if (existingDispute) {
            throw new common_1.BadRequestException('A dispute already exists for this booking');
        }
        const dispute = await this.prisma.dispute.create({
            data: {
                booking_hotel_id: booking_hotel_id || null,
                booking_car_id: booking_car_id || null,
                raised_by,
                description,
                status: client_1.DisputeStatus.pending,
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
        if (driverId) {
            const wasAutoSuspended = await this.checkAndAutoSuspendDriver(driverId);
            if (wasAutoSuspended) {
                console.log(`Driver ${driverId} auto-suspended due to 5+ pending disputes`);
            }
        }
        const admins = await this.prisma.user.findMany({
            where: { role: 'admin' },
            select: { id: true },
        });
        for (const admin of admins) {
            await this.notificationsService.createNotification(admin.id, 'dispute_raised', 'New Dispute Raised', `A new dispute has been raised: ${description.substring(0, 100)}...`);
        }
        const otherPartyUserId = booking_car_id
            ? (_a = dispute.bookingCar) === null || _a === void 0 ? void 0 : _a.user_id
            : (_b = dispute.bookingHotel) === null || _b === void 0 ? void 0 : _b.user_id;
        if (otherPartyUserId) {
            await this.notificationsService.createNotification(otherPartyUserId, 'dispute_raised', 'Dispute Raised Against You', `A dispute has been raised regarding your booking. Please review and respond.`);
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
    async resolveDispute(disputeId, dto) {
        var _a, _b;
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
            throw new common_1.NotFoundException('Dispute not found');
        }
        if (dispute.status !== client_1.DisputeStatus.pending) {
            throw new common_1.BadRequestException('Dispute is already resolved or rejected');
        }
        const updatedDispute = await this.prisma.dispute.update({
            where: { id: disputeId },
            data: {
                status: client_1.DisputeStatus.resolved,
                resolved_at: new Date(),
            },
        });
        const customerUserId = dispute.booking_hotel_id
            ? (_a = dispute.bookingHotel) === null || _a === void 0 ? void 0 : _a.user_id
            : (_b = dispute.bookingCar) === null || _b === void 0 ? void 0 : _b.user_id;
        if (customerUserId) {
            await this.notificationsService.createNotification(customerUserId, 'dispute_resolved', 'Dispute Resolved', `Your dispute has been resolved: ${dto.resolution}`);
        }
        return {
            message: 'Dispute resolved successfully',
            dispute: updatedDispute,
        };
    }
    async getBookingStats(dateRange) {
        const where = {};
        if (dateRange === null || dateRange === void 0 ? void 0 : dateRange.from) {
            where.created_at = { gte: dateRange.from };
        }
        if (dateRange === null || dateRange === void 0 ? void 0 : dateRange.to) {
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
            const totalBookings = driver.cars.reduce((sum, car) => sum + car.carBookings.length, 0);
            const totalEarnings = driver.cars.reduce((sum, car) => sum +
                car.carBookings.reduce((earnSum, booking) => earnSum + parseFloat(booking.driver_earnings.toString()), 0), 0);
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
            .slice(0, 10);
        return performance;
    }
    async getDriverDisciplinaryHistory(driverId) {
        const driver = await this.prisma.driver.findUnique({
            where: { id: driverId },
            select: { id: true },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver not found');
        }
        const actions = await this.prisma.driverDisciplinaryAction.findMany({
            where: { driver_id: driverId },
            orderBy: { created_at: 'desc' },
        });
        const actionsWithDisputes = await Promise.all(actions.map(async (action) => {
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
        }));
        return actionsWithDisputes;
    }
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
            pending: pendingActions.map((action) => {
                var _a, _b;
                return ({
                    driver_id: action.driver_id,
                    driver_name: action.driver.user.full_name,
                    driver_email: action.driver.user.email,
                    action_type: action.action_type,
                    dispute_count: action.dispute_count,
                    scheduled_start: ((_a = action.scheduled_start) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                    scheduled_end: ((_b = action.scheduled_end) === null || _b === void 0 ? void 0 : _b.toISOString()) || null,
                    suspension_days: action.suspension_days,
                });
            }),
            paused: pausedActions.map((action) => {
                var _a, _b;
                return ({
                    driver_id: action.driver_id,
                    driver_name: action.driver.user.full_name,
                    driver_email: action.driver.user.email,
                    action_type: action.action_type,
                    dispute_count: action.dispute_count,
                    pause_reason: action.pause_reason,
                    scheduled_start: ((_a = action.scheduled_start) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                    scheduled_end: ((_b = action.scheduled_end) === null || _b === void 0 ? void 0 : _b.toISOString()) || null,
                });
            }),
        };
    }
    async getRevenueReport(dateRange) {
        var _a, _b;
        const where = {
            status: 'completed',
        };
        if (dateRange === null || dateRange === void 0 ? void 0 : dateRange.from) {
            where.created_at = { gte: dateRange.from };
        }
        if (dateRange === null || dateRange === void 0 ? void 0 : dateRange.to) {
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
            total_revenue: parseFloat(((_a = revenue._sum.amount) === null || _a === void 0 ? void 0 : _a.toString()) || '0'),
            total_commission: parseFloat(((_b = revenue._sum.application_fee_amount) === null || _b === void 0 ? void 0 : _b.toString()) || '0'),
            total_transactions: revenue._count,
            currency: 'USD',
        };
    }
    async getAllUsers(query = {}) {
        const { page = 1, limit = 20, role, status, city_id } = query;
        const where = {};
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
    async getAllHotels(query = {}) {
        const { page = 1, limit = 20, city_id, is_listed, is_active, manager_id } = query;
        const where = {};
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
                const totalEarnings = hotel.hotelBookings.reduce((sum, booking) => sum + parseFloat(booking.total_amount.toString()), 0);
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
    async getHotelDetails(id) {
        var _a;
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
            throw new common_1.NotFoundException('Hotel not found');
        }
        return {
            id: hotel.id.toString(),
            name: hotel.name,
            description: hotel.description,
            location: hotel.city.name,
            address: hotel.address,
            rating: hotel.star_rating,
            amenities: hotel.amenities || [],
            is_active: hotel.is_active,
            is_listed: hotel.is_listed,
            manager: hotel.manager ? {
                id: hotel.manager.id,
                is_verified: hotel.manager.is_verified,
                verified_at: ((_a = hotel.manager.verified_at) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
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
                amenities: rt.amenities || [],
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
    async updateHotel(id, data) {
        const hotel = await this.prisma.hotel.findUnique({ where: { id } });
        if (!hotel) {
            throw new common_1.NotFoundException('Hotel not found');
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
    async deleteHotel(id) {
        const hotel = await this.prisma.hotel.findUnique({ where: { id } });
        if (!hotel) {
            throw new common_1.NotFoundException('Hotel not found');
        }
        await this.prisma.hotel.update({
            where: { id },
            data: { is_active: false },
        });
        return { message: 'Hotel deactivated successfully' };
    }
    async getAllHotelManagers(query = {}) {
        const { page = 1, limit = 20, is_verified, city_id } = query;
        const where = {};
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
            data: hotelManagers.map(manager => {
                var _a;
                return ({
                    id: manager.id,
                    user: manager.user,
                    is_verified: manager.is_verified,
                    verification_notes: manager.verification_notes,
                    verified_at: ((_a = manager.verified_at) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                    hotels_count: manager.hotels.length,
                    active_hotels_count: manager.hotels.filter(h => h.is_active && h.is_listed).length,
                    has_pending_documents: manager.documents.some(d => d.status === 'pending'),
                    documents: manager.documents.map(doc => {
                        var _a, _b;
                        return ({
                            id: doc.id,
                            document_type: doc.document_type,
                            status: doc.status,
                            uploaded_at: ((_a = doc.uploaded_at) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                            reviewed_at: ((_b = doc.reviewed_at) === null || _b === void 0 ? void 0 : _b.toISOString()) || null,
                        });
                    }),
                    created_at: manager.created_at.toISOString(),
                });
            }),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                total_pages: Math.ceil(total / limit),
            },
        };
    }
    async getHotelManagerDetails(managerId) {
        var _a;
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
            throw new common_1.NotFoundException('Hotel manager not found');
        }
        return {
            id: hotelManager.id,
            user: hotelManager.user,
            is_verified: hotelManager.is_verified,
            verification_notes: hotelManager.verification_notes,
            verified_at: ((_a = hotelManager.verified_at) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
            stripe_account_id: hotelManager.stripe_account_id,
            hotels: hotelManager.hotels.map(hotel => {
                var _a;
                const totalEarnings = hotel.hotelBookings.reduce((sum, booking) => sum + parseFloat(booking.total_amount.toString()), 0);
                return {
                    id: hotel.id,
                    name: hotel.name,
                    city: hotel.city.name,
                    is_active: hotel.is_active,
                    is_listed: hotel.is_listed,
                    room_types_count: hotel.roomTypes.length,
                    total_bookings: hotel.hotelBookings.length,
                    total_earnings: totalEarnings,
                    image: ((_a = hotel.images[0]) === null || _a === void 0 ? void 0 : _a.image_url) || null,
                };
            }),
            documents: hotelManager.documents.map(doc => {
                var _a, _b;
                return ({
                    id: doc.id,
                    document_type: doc.document_type,
                    document_url: doc.document_url,
                    status: doc.status,
                    rejection_reason: doc.rejection_reason,
                    uploaded_at: ((_a = doc.uploaded_at) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                    reviewed_at: ((_b = doc.reviewed_at) === null || _b === void 0 ? void 0 : _b.toISOString()) || null,
                    reviewer: doc.reviewer,
                });
            }),
            created_at: hotelManager.created_at.toISOString(),
            updated_at: hotelManager.updated_at.toISOString(),
        };
    }
    async verifyHotelManager(managerId, dto) {
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
            throw new common_1.NotFoundException('Hotel manager not found');
        }
        const updatedManager = await this.prisma.hotelManager.update({
            where: { id: managerId },
            data: {
                is_verified: dto.is_verified,
                verification_notes: dto.verification_notes || null,
                verified_at: dto.is_verified ? new Date() : null,
            },
        });
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
        }
        else {
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
        if (dto.is_verified) {
            await this.notificationsService.notifyHotelManagerVerificationApproved(hotelManager.user.id, hotelManager.user.full_name);
        }
        else {
            await this.notificationsService.notifyHotelManagerVerificationRejected(hotelManager.user.id, hotelManager.user.full_name, dto.verification_notes || 'Verification rejected');
        }
        return {
            message: dto.is_verified ? 'Hotel manager verified successfully' : 'Hotel manager verification rejected',
            hotel_manager: updatedManager,
        };
    }
    async updateDocumentReviewer(managerId, adminUserId) {
        await this.prisma.hotelManagerDocument.updateMany({
            where: {
                hotel_manager_id: managerId,
                reviewed_by: null,
                reviewed_at: { not: null },
            },
            data: {
                reviewed_by: adminUserId,
            },
        });
    }
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
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        drivers_service_1.DriversService,
        notifications_service_1.NotificationsService])
], AdminService);
//# sourceMappingURL=admin.service.js.map