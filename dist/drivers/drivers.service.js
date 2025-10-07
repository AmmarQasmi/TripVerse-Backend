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
let DriversService = class DriversService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async submitVerification(userId, dto) {
        const driver = await this.prisma.driver.findFirst({
            where: { user_id: userId },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver profile not found');
        }
        if (dto.existing_rating < 4.0) {
            throw new common_1.BadRequestException('Existing rating must be 4.0 or higher for verification');
        }
        const updatedDriver = await this.prisma.driver.update({
            where: { id: driver.id },
            data: {
                license_image_url: dto.license_image_url,
                rating_screenshot_url: dto.rating_screenshot_url,
                rating_platform: dto.rating_platform,
                existing_rating: dto.existing_rating,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        full_name: true,
                        role: true,
                    },
                },
            },
        });
        return {
            message: 'Verification documents submitted successfully. Awaiting admin approval.',
            driver: updatedDriver,
        };
    }
    async verifyDriver(driverId, dto) {
        const driver = await this.prisma.driver.findUnique({
            where: { id: driverId },
        });
        if (!driver) {
            throw new common_1.NotFoundException('Driver not found');
        }
        if (!driver.license_image_url || !driver.rating_screenshot_url) {
            throw new common_1.BadRequestException('Driver has not submitted verification documents yet');
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
                    },
                },
            },
        });
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
                        region: true,
                    },
                },
                cars: true,
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
                license_image_url: { not: null },
                rating_screenshot_url: { not: null },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        full_name: true,
                        region: true,
                    },
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
                        region: true,
                    },
                },
                cars: true,
            },
            orderBy: {
                verified_at: 'desc',
            },
        });
    }
};
exports.DriversService = DriversService;
exports.DriversService = DriversService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DriversService);
//# sourceMappingURL=drivers.service.js.map