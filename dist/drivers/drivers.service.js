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
exports.DriversService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const cloudinary_service_1 = require("../common/cloudinary/cloudinary.service");
const notifications_service_1 = require("../common/services/notifications.service");
let DriversService = class DriversService {
    constructor(prisma, cloudinaryService, notificationsService) {
        this.prisma = prisma;
        this.cloudinaryService = cloudinaryService;
        this.notificationsService = notificationsService;
    }
    async submitVerification(userId, dto) {
        const driver = await this.prisma.driver.findFirst({
            where: { user_id: userId },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver profile not found');
        }
        for (const rating of dto.ratings) {
            if (rating.rating < 4.0) {
                throw new common_1.BadRequestException(`Rating for ${rating.platform} must be 4.0 or higher for verification`);
            }
        }
        const ratingsWithScreenshots = dto.ratings.filter(r => r.screenshot_url && r.screenshot_url.trim() !== '');
        if (ratingsWithScreenshots.length === 0) {
            throw new common_1.BadRequestException('At least one rating must include a screenshot');
        }
        for (const doc of dto.documents) {
            const existingDoc = await this.prisma.driverDocument.findFirst({
                where: {
                    driver_id: driver.id,
                    document_type: doc.document_type,
                },
            });
            if (existingDoc) {
                await this.prisma.driverDocument.update({
                    where: { id: existingDoc.id },
                    data: {
                        document_url: doc.document_url,
                        status: 'pending',
                        uploaded_at: new Date(),
                    },
                });
            }
            else {
                await this.prisma.driverDocument.create({
                    data: {
                        driver_id: driver.id,
                        document_type: doc.document_type,
                        document_url: doc.document_url,
                        status: 'pending',
                    },
                });
            }
        }
        for (const rating of dto.ratings) {
            const existingRating = await this.prisma.driverRating.findFirst({
                where: {
                    driver_id: driver.id,
                    platform: rating.platform,
                },
            });
            if (existingRating) {
                await this.prisma.driverRating.update({
                    where: { id: existingRating.id },
                    data: {
                        rating: rating.rating,
                        screenshot_url: rating.screenshot_url || null,
                        verified_at: null,
                    },
                });
            }
            else {
                await this.prisma.driverRating.create({
                    data: {
                        driver_id: driver.id,
                        platform: rating.platform,
                        rating: rating.rating,
                        screenshot_url: rating.screenshot_url || null,
                    },
                });
            }
        }
        const wasRejected = driver.verification_notes && !driver.is_verified;
        const allDocuments = await this.prisma.driverDocument.findMany({
            where: { driver_id: driver.id },
        });
        const allDocsPending = allDocuments.length > 0 &&
            allDocuments.every(doc => doc.status === 'pending');
        if (wasRejected && allDocsPending) {
            await this.prisma.driver.update({
                where: { id: driver.id },
                data: {
                    verification_notes: null,
                },
            });
        }
        const updatedDriver = await this.prisma.driver.findUnique({
            where: { id: driver.id },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        full_name: true,
                        role: true,
                        status: true,
                        city: true,
                    },
                },
                documents: {
                    orderBy: { uploaded_at: 'desc' },
                },
                ratings: {
                    orderBy: { created_at: 'desc' },
                },
            },
        });
        if (!updatedDriver) {
            throw new common_1.NotFoundException('Driver not found after submission');
        }
        if (updatedDriver.user) {
            await this.notificationsService.notifyAdminsOfVerificationSubmission('driver', updatedDriver.user.full_name, updatedDriver.user.email);
        }
        return {
            message: 'Verification documents submitted successfully. Awaiting admin approval.',
            driver: updatedDriver,
        };
    }
    async verifyDriver(driverId, dto) {
        const driver = await this.prisma.driver.findUnique({
            where: { id: driverId },
            include: {
                documents: true,
                ratings: true,
            },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver not found');
        }
        if (driver.documents.length === 0 || driver.ratings.length === 0) {
            throw new common_1.BadRequestException('Driver has not submitted verification documents yet');
        }
        const hasLicense = driver.documents.some((doc) => doc.document_type === 'license');
        if (!hasLicense) {
            throw new common_1.BadRequestException('Driver must submit a license document');
        }
        const updatedDriver = await this.prisma.driver.update({
            where: { id: driverId },
            data: {
                is_verified: dto.is_verified,
                verification_notes: dto.verification_notes,
                verified_at: dto.is_verified ? new Date() : null,
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
                    orderBy: { uploaded_at: 'desc' },
                },
                ratings: {
                    orderBy: { created_at: 'desc' },
                },
            },
        });
        if (dto.is_verified) {
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
        else {
            await this.prisma.driverDocument.updateMany({
                where: {
                    driver_id: driverId,
                    status: 'pending',
                },
                data: {
                    status: 'rejected',
                    rejection_reason: dto.verification_notes || 'Verification rejected by admin',
                    reviewed_at: new Date(),
                },
            });
        }
        return {
            message: dto.is_verified ? 'Driver verified successfully' : 'Driver verification rejected',
            driver: updatedDriver,
        };
    }
    async getDriverProfile(userId) {
        const driver = await this.prisma.driver.findFirst({
            where: { user_id: userId },
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
                cars: {
                    include: {
                        carModel: true,
                        images: {
                            orderBy: { display_order: 'asc' },
                        },
                    },
                },
                documents: {
                    orderBy: { uploaded_at: 'desc' },
                },
                ratings: {
                    orderBy: { created_at: 'desc' },
                },
            },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver profile not found');
        }
        return driver;
    }
    async getPendingVerifications() {
        return this.prisma.driver.findMany({
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
                ratings: {
                    where: { verified_at: null },
                    orderBy: { created_at: 'desc' },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        });
    }
    async getVerifiedDrivers() {
        return this.prisma.driver.findMany({
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
                cars: {
                    include: {
                        carModel: true,
                        images: {
                            orderBy: { display_order: 'asc' },
                        },
                    },
                },
                documents: {
                    where: { status: 'approved' },
                    orderBy: { uploaded_at: 'desc' },
                },
                ratings: {
                    where: { verified_at: { not: null } },
                    orderBy: { created_at: 'desc' },
                },
            },
            orderBy: {
                verified_at: 'desc',
            },
        });
    }
    async uploadDocument(userId, file, documentType) {
        const driver = await this.prisma.driver.findFirst({
            where: { user_id: userId },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver profile not found');
        }
        try {
            const uploadResult = await this.cloudinaryService.uploadDocument(file, 'driver-documents', {});
            const document = await this.prisma.driverDocument.create({
                data: {
                    driver_id: driver.id,
                    document_type: documentType,
                    document_url: uploadResult.secure_url,
                    public_id: uploadResult.public_id,
                    status: 'pending',
                },
            });
            return {
                message: 'Document uploaded successfully',
                document: {
                    id: document.id,
                    document_type: document.document_type,
                    document_url: document.document_url,
                    public_id: document.public_id,
                    status: document.status,
                },
            };
        }
        catch (error) {
            throw new common_1.BadRequestException('Failed to upload document');
        }
    }
    async deleteDocument(userId, documentId) {
        const driver = await this.prisma.driver.findFirst({
            where: { user_id: userId },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver profile not found');
        }
        const document = await this.prisma.driverDocument.findFirst({
            where: {
                id: documentId,
                driver_id: driver.id,
            },
        });
        if (!document) {
            throw new common_1.NotFoundException('Document not found');
        }
        try {
            if (document.public_id) {
                await this.cloudinaryService.deleteImage(document.public_id);
            }
            await this.prisma.driverDocument.delete({
                where: { id: documentId },
            });
            return { message: 'Document deleted successfully' };
        }
        catch (error) {
            throw new common_1.BadRequestException('Failed to delete document');
        }
    }
    async getDriverDashboard(userId) {
        var _a, _b;
        const driver = await this.prisma.driver.findFirst({
            where: { user_id: userId },
            select: {
                id: true,
                is_verified: true,
                verified_at: true,
            },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver profile not found');
        }
        const [incomingRequests, confirmedBookings, earningsResult, carsCount, activeCarsCount, recentBookings,] = await Promise.all([
            this.prisma.carBooking.count({
                where: {
                    car: { driver_id: driver.id },
                    status: 'PENDING_DRIVER_ACCEPTANCE',
                },
            }),
            this.prisma.carBooking.count({
                where: {
                    car: { driver_id: driver.id },
                    status: { in: ['ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'] },
                },
            }),
            this.prisma.carBooking.aggregate({
                where: {
                    car: { driver_id: driver.id },
                    status: 'COMPLETED',
                },
                _sum: { driver_earnings: true },
            }),
            this.prisma.car.count({
                where: { driver_id: driver.id },
            }),
            this.prisma.car.count({
                where: { driver_id: driver.id, is_active: true },
            }),
            this.prisma.carBooking.findMany({
                where: { car: { driver_id: driver.id } },
                include: {
                    user: { select: { id: true, full_name: true } },
                    car: { include: { carModel: true } },
                },
                orderBy: { created_at: 'desc' },
                take: 5,
            }),
        ]);
        const totalEarnings = parseFloat(((_a = earningsResult._sum.driver_earnings) === null || _a === void 0 ? void 0 : _a.toString()) || '0');
        return {
            verification_status: {
                is_verified: driver.is_verified,
                verified_at: ((_b = driver.verified_at) === null || _b === void 0 ? void 0 : _b.toISOString()) || null,
            },
            stats: {
                incoming_requests: incomingRequests,
                confirmed_bookings: confirmedBookings,
                total_earnings: totalEarnings,
                car_listings_count: carsCount,
                active_cars_count: activeCarsCount,
            },
            recent_bookings: recentBookings.map((booking) => ({
                id: booking.id,
                status: booking.status,
                customer: {
                    name: booking.user.full_name,
                },
                car: {
                    make: booking.car.carModel.make,
                    model: booking.car.carModel.model,
                },
                start_date: booking.start_date.toISOString().split('T')[0],
                end_date: booking.end_date.toISOString().split('T')[0],
                driver_earnings: parseFloat(booking.driver_earnings.toString()),
                created_at: booking.created_at.toISOString(),
            })),
        };
    }
    async getDriverEarnings(userId, dateFrom, dateTo) {
        var _a;
        const driver = await this.prisma.driver.findFirst({
            where: { user_id: userId },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver profile not found');
        }
        const where = {
            car: {
                driver_id: driver.id,
            },
            status: 'COMPLETED',
        };
        if (dateFrom) {
            where.completed_at = { gte: dateFrom };
        }
        if (dateTo) {
            where.completed_at = {
                ...where.completed_at,
                lte: dateTo,
            };
        }
        const earningsResult = await this.prisma.carBooking.aggregate({
            where,
            _sum: {
                driver_earnings: true,
            },
            _count: true,
        });
        const bookings = await this.prisma.carBooking.findMany({
            where,
            include: {
                car: {
                    include: {
                        carModel: true,
                    },
                },
                user: {
                    select: {
                        full_name: true,
                    },
                },
            },
            orderBy: { completed_at: 'desc' },
        });
        return {
            total_earnings: parseFloat(((_a = earningsResult._sum.driver_earnings) === null || _a === void 0 ? void 0 : _a.toString()) || '0'),
            total_completed_bookings: earningsResult._count,
            currency: 'USD',
            bookings: bookings.map((booking) => {
                var _a;
                return ({
                    id: booking.id,
                    customer_name: booking.user.full_name,
                    car: `${booking.car.carModel.make} ${booking.car.carModel.model}`,
                    driver_earnings: parseFloat(booking.driver_earnings.toString()),
                    completed_at: ((_a = booking.completed_at) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                });
            }),
        };
    }
    async getEarningsBreakdown(userId) {
        const driver = await this.prisma.driver.findFirst({
            where: { user_id: userId },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver profile not found');
        }
        const bookings = await this.prisma.carBooking.findMany({
            where: {
                car: {
                    driver_id: driver.id,
                },
                status: 'COMPLETED',
                completed_at: { not: null },
            },
            include: {
                car: {
                    include: {
                        carModel: true,
                    },
                },
            },
        });
        const byMonth = {};
        bookings.forEach((booking) => {
            if (booking.completed_at) {
                const month = booking.completed_at.toISOString().substring(0, 7);
                byMonth[month] = (byMonth[month] || 0) + parseFloat(booking.driver_earnings.toString());
            }
        });
        const byCar = {};
        bookings.forEach((booking) => {
            const carId = booking.car_id;
            const carName = `${booking.car.carModel.make} ${booking.car.carModel.model}`;
            if (!byCar[carId]) {
                byCar[carId] = {
                    car: carName,
                    earnings: 0,
                    bookings: 0,
                };
            }
            byCar[carId].earnings += parseFloat(booking.driver_earnings.toString());
            byCar[carId].bookings += 1;
        });
        return {
            by_month: Object.entries(byMonth).map(([month, earnings]) => ({
                month,
                earnings,
            })),
            by_car: Object.values(byCar),
        };
    }
    async getSuspensionStatus(userId) {
        var _a;
        const driver = await this.prisma.driver.findFirst({
            where: { user_id: userId },
            include: {
                user: true,
                currentSuspension: true,
                disciplinary_actions: {
                    where: {
                        period_end: { gte: new Date() },
                    },
                    orderBy: { created_at: 'desc' },
                    take: 1,
                },
            },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver profile not found');
        }
        const isSuspended = driver.user.status === 'inactive';
        const isBanned = driver.user.status === 'banned';
        const currentAction = driver.currentSuspension || driver.disciplinary_actions[0];
        const periodStart = currentAction
            ? new Date(currentAction.period_start)
            : new Date(new Date().setMonth(new Date().getMonth() - 3));
        const disputeCount = await this.prisma.dispute.count({
            where: {
                bookingCar: {
                    car: { driver_id: driver.id },
                },
                created_at: { gte: periodStart },
            },
        });
        return {
            is_suspended: isSuspended,
            is_banned: isBanned,
            is_paused: (currentAction === null || currentAction === void 0 ? void 0 : currentAction.is_paused) || false,
            suspension_type: currentAction === null || currentAction === void 0 ? void 0 : currentAction.action_type,
            dispute_count: disputeCount,
            suspension_end_date: (_a = currentAction === null || currentAction === void 0 ? void 0 : currentAction.scheduled_end) === null || _a === void 0 ? void 0 : _a.toISOString(),
            pause_reason: currentAction === null || currentAction === void 0 ? void 0 : currentAction.pause_reason,
            warning_sent: !!driver.last_warning_at,
        };
    }
};
exports.DriversService = DriversService;
exports.DriversService = DriversService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cloudinary_service_1.CloudinaryService,
        notifications_service_1.NotificationsService])
], DriversService);
//# sourceMappingURL=drivers.service.js.map