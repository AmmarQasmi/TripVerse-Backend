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
var MonumentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonumentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const cloudinary_service_1 = require("../common/cloudinary/cloudinary.service");
const google_vision_service_1 = require("../common/services/google-vision.service");
const wikipedia_service_1 = require("../common/services/wikipedia.service");
const google_places_service_1 = require("../common/services/google-places.service");
let MonumentsService = MonumentsService_1 = class MonumentsService {
    constructor(prisma, cloudinaryService, googleVisionService, wikipediaService, googlePlacesService) {
        this.prisma = prisma;
        this.cloudinaryService = cloudinaryService;
        this.googleVisionService = googleVisionService;
        this.wikipediaService = wikipediaService;
        this.googlePlacesService = googlePlacesService;
        this.logger = new common_1.Logger(MonumentsService_1.name);
    }
    async recognizeMonument(userId, imageBuffer, originalName) {
        try {
            this.logger.log(`Starting monument recognition for user ${userId}`);
            const uploadResult = await this.cloudinaryService.uploadImage({ buffer: imageBuffer, originalname: originalName }, 'monuments', {
                transformation: [
                    { width: 1200, height: 800, crop: 'limit', quality: 'auto' }
                ]
            });
            const imageUrl = uploadResult.secure_url;
            const landmarks = await this.googleVisionService.detectLandmarks(imageBuffer);
            if (landmarks.length === 0) {
                throw new common_1.BadRequestException('No monuments or landmarks detected in the image');
            }
            const bestLandmark = landmarks.reduce((prev, current) => current.confidence > prev.confidence ? current : prev);
            this.logger.log(`Detected landmark: ${bestLandmark.name} (confidence: ${bestLandmark.confidence})`);
            let wikipediaData = null;
            try {
                wikipediaData = await this.wikipediaService.searchMonument(bestLandmark.name);
            }
            catch (error) {
                this.logger.warn('Wikipedia enrichment failed:', error.message);
            }
            let placeDetails = null;
            if (bestLandmark.location) {
                try {
                    const places = await this.googlePlacesService.searchPlaces(bestLandmark.name, bestLandmark.location);
                    if (places.length > 0) {
                        placeDetails = await this.googlePlacesService.getPlaceDetails(places[0].place_id);
                    }
                }
                catch (error) {
                    this.logger.warn('Google Places enrichment failed:', error.message);
                }
            }
            const recognition = await this.prisma.monumentRecognition.create({
                data: {
                    user_id: userId,
                    image_url: imageUrl,
                    name: bestLandmark.name,
                    confidence: bestLandmark.confidence,
                    wiki_snippet: wikipediaData === null || wikipediaData === void 0 ? void 0 : wikipediaData.extract,
                    raw_payload_json: {
                        landmarks: landmarks,
                        wikipedia: wikipediaData,
                        placeDetails: placeDetails,
                        vision: {
                            location: bestLandmark.location,
                            boundingPoly: bestLandmark.boundingPoly,
                        },
                    },
                },
            });
            this.logger.log(`Monument recognition completed: ${recognition.id}`);
            return {
                id: recognition.id,
                name: recognition.name,
                confidence: Number(recognition.confidence),
                imageUrl: recognition.image_url,
                wikiSnippet: recognition.wiki_snippet || undefined,
                wikipediaUrl: wikipediaData === null || wikipediaData === void 0 ? void 0 : wikipediaData.url,
                coordinates: bestLandmark.location,
                placeDetails: placeDetails || undefined,
                rawData: recognition.raw_payload_json,
                createdAt: recognition.created_at,
            };
        }
        catch (error) {
            this.logger.error('Monument recognition failed:', error);
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException('Failed to recognize monument in image');
        }
    }
    async getUserRecognitions(userId, page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        const [recognitions, total] = await Promise.all([
            this.prisma.monumentRecognition.findMany({
                where: { user_id: userId },
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.monumentRecognition.count({
                where: { user_id: userId },
            }),
        ]);
        const results = recognitions.map(rec => {
            var _a, _b, _c, _d, _e;
            return ({
                id: rec.id,
                name: rec.name,
                confidence: Number(rec.confidence),
                imageUrl: rec.image_url,
                wikiSnippet: rec.wiki_snippet || undefined,
                wikipediaUrl: (_b = (_a = rec.raw_payload_json) === null || _a === void 0 ? void 0 : _a.wikipedia) === null || _b === void 0 ? void 0 : _b.url,
                coordinates: (_d = (_c = rec.raw_payload_json) === null || _c === void 0 ? void 0 : _c.vision) === null || _d === void 0 ? void 0 : _d.location,
                placeDetails: (_e = rec.raw_payload_json) === null || _e === void 0 ? void 0 : _e.placeDetails,
                rawData: rec.raw_payload_json,
                createdAt: rec.created_at,
            });
        });
        return {
            recognitions: results,
            total,
            page,
            limit,
        };
    }
    async getRecognition(userId, recognitionId) {
        var _a, _b, _c, _d, _e;
        const recognition = await this.prisma.monumentRecognition.findFirst({
            where: {
                id: recognitionId,
                user_id: userId,
            },
        });
        if (!recognition) {
            throw new common_1.NotFoundException('Monument recognition not found');
        }
        return {
            id: recognition.id,
            name: recognition.name,
            confidence: Number(recognition.confidence),
            imageUrl: recognition.image_url,
            wikiSnippet: recognition.wiki_snippet || undefined,
            wikipediaUrl: (_b = (_a = recognition.raw_payload_json) === null || _a === void 0 ? void 0 : _a.wikipedia) === null || _b === void 0 ? void 0 : _b.url,
            coordinates: (_d = (_c = recognition.raw_payload_json) === null || _c === void 0 ? void 0 : _c.vision) === null || _d === void 0 ? void 0 : _d.location,
            placeDetails: (_e = recognition.raw_payload_json) === null || _e === void 0 ? void 0 : _e.placeDetails,
            rawData: recognition.raw_payload_json,
            createdAt: recognition.created_at,
        };
    }
    async deleteRecognition(userId, recognitionId) {
        const recognition = await this.prisma.monumentRecognition.findFirst({
            where: {
                id: recognitionId,
                user_id: userId,
            },
        });
        if (!recognition) {
            throw new common_1.NotFoundException('Monument recognition not found');
        }
        try {
            const publicId = this.cloudinaryService.extractPublicId(recognition.image_url);
            if (publicId) {
                await this.cloudinaryService.deleteImage(publicId);
            }
        }
        catch (error) {
            this.logger.warn('Failed to delete image from Cloudinary:', error.message);
        }
        await this.prisma.monumentRecognition.delete({
            where: { id: recognitionId },
        });
        this.logger.log(`Deleted monument recognition: ${recognitionId}`);
    }
    async logExport(userId, monumentId, format, fileUrl, fileSize) {
        const exportLog = await this.prisma.monumentExportLog.create({
            data: {
                user_id: userId,
                monument_id: monumentId,
                format,
                file_url: fileUrl,
                file_size: fileSize,
            },
        });
        return {
            id: exportLog.id,
            monumentId: exportLog.monument_id,
            format: exportLog.format,
            fileUrl: exportLog.file_url,
            fileSize: exportLog.file_size,
            createdAt: exportLog.created_at,
        };
    }
    async getUserExports(userId, page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        const [exports, total] = await Promise.all([
            this.prisma.monumentExportLog.findMany({
                where: { user_id: userId },
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
                include: {
                    monument: {
                        select: {
                            name: true,
                            image_url: true,
                        },
                    },
                },
            }),
            this.prisma.monumentExportLog.count({
                where: { user_id: userId },
            }),
        ]);
        const results = exports.map((exp) => ({
            id: exp.id,
            monumentId: exp.monument_id,
            format: exp.format,
            fileUrl: exp.file_url,
            fileSize: exp.file_size,
            createdAt: exp.created_at,
        }));
        return {
            exports: results,
            total,
            page,
            limit,
        };
    }
    async getExportStats(userId) {
        const [totalExports, pdfExports, docxExports, lastExport, fileSizeStats] = await Promise.all([
            this.prisma.monumentExportLog.count({
                where: { user_id: userId },
            }),
            this.prisma.monumentExportLog.count({
                where: { user_id: userId, format: 'pdf' },
            }),
            this.prisma.monumentExportLog.count({
                where: { user_id: userId, format: 'docx' },
            }),
            this.prisma.monumentExportLog.findFirst({
                where: { user_id: userId },
                orderBy: { created_at: 'desc' },
                select: { created_at: true },
            }),
            this.prisma.monumentExportLog.aggregate({
                where: { user_id: userId },
                _sum: { file_size: true },
            }),
        ]);
        return {
            totalExports,
            pdfExports,
            docxExports,
            totalFileSize: fileSizeStats._sum.file_size || 0,
            lastExportDate: lastExport === null || lastExport === void 0 ? void 0 : lastExport.created_at,
        };
    }
};
exports.MonumentsService = MonumentsService;
exports.MonumentsService = MonumentsService = MonumentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cloudinary_service_1.CloudinaryService,
        google_vision_service_1.GoogleVisionService,
        wikipedia_service_1.WikipediaService,
        google_places_service_1.GooglePlacesService])
], MonumentsService);
//# sourceMappingURL=monuments.service.js.map