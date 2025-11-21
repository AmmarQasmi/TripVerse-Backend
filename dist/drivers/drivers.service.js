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
let DriversService = class DriversService {
    constructor(prisma, cloudinaryService) {
        this.prisma = prisma;
        this.cloudinaryService = cloudinaryService;
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
};
exports.DriversService = DriversService;
exports.DriversService = DriversService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cloudinary_service_1.CloudinaryService])
], DriversService);
//# sourceMappingURL=drivers.service.js.map