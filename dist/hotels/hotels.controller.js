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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotelsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const hotels_service_1 = require("./hotels.service");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const client_1 = require("@prisma/client");
const multer_config_1 = require("../common/config/multer.config");
let HotelsController = class HotelsController {
    constructor(hotelsService) {
        this.hotelsService = hotelsService;
    }
    async findAll(query) {
        return this.hotelsService.findAll(query);
    }
    async findOne(id) {
        return this.hotelsService.findOne(id);
    }
    async create(data) {
        return this.hotelsService.create(data);
    }
    async update(id, data) {
        return this.hotelsService.update(id, data);
    }
    async remove(id) {
        return this.hotelsService.remove(id);
    }
    async addRoomType(hotelId, data) {
        return this.hotelsService.addRoomType(hotelId, data);
    }
    async updateRoomType(hotelId, roomId, data) {
        return this.hotelsService.updateRoomType(hotelId, roomId, data);
    }
    async removeRoomType(hotelId, roomId) {
        return this.hotelsService.removeRoomType(hotelId, roomId);
    }
    async addImages(hotelId, imageUrls) {
        return this.hotelsService.addImages(hotelId, imageUrls);
    }
    async removeImage(hotelId, imageId) {
        return this.hotelsService.removeImage(hotelId, imageId);
    }
    async reorderImages(hotelId, imageIds) {
        return this.hotelsService.reorderImages(hotelId, imageIds);
    }
    async uploadImages(hotelId, files) {
        if (!files || files.length === 0) {
            throw new common_1.BadRequestException('No files uploaded');
        }
        return this.hotelsService.uploadImages(hotelId, files);
    }
    async removeImageWithCloudinary(hotelId, imageId) {
        return this.hotelsService.removeImageWithCloudinary(hotelId, imageId);
    }
    async getOptimizedImages(hotelId) {
        return this.hotelsService.getOptimizedImages(hotelId);
    }
    health() {
        return { ok: true, service: 'hotels' };
    }
};
exports.HotelsController = HotelsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':hotelId/rooms'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('hotelId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "addRoomType", null);
__decorate([
    (0, common_1.Patch)(':hotelId/rooms/:roomId'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('hotelId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('roomId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, Object]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "updateRoomType", null);
__decorate([
    (0, common_1.Delete)(':hotelId/rooms/:roomId'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('hotelId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('roomId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "removeRoomType", null);
__decorate([
    (0, common_1.Post)(':hotelId/images'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('hotelId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)('imageUrls')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Array]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "addImages", null);
__decorate([
    (0, common_1.Delete)(':hotelId/images/:imageId'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('hotelId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('imageId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "removeImage", null);
__decorate([
    (0, common_1.Patch)(':hotelId/images/reorder'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('hotelId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)('imageIds')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Array]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "reorderImages", null);
__decorate([
    (0, common_1.Post)(':hotelId/images/upload'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('images', 10, multer_config_1.imageUploadConfig)),
    __param(0, (0, common_1.Param)('hotelId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Array]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "uploadImages", null);
__decorate([
    (0, common_1.Delete)(':hotelId/images/:imageId/cloudinary'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('hotelId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('imageId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "removeImageWithCloudinary", null);
__decorate([
    (0, common_1.Get)(':hotelId/images/optimized'),
    __param(0, (0, common_1.Param)('hotelId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "getOptimizedImages", null);
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HotelsController.prototype, "health", null);
exports.HotelsController = HotelsController = __decorate([
    (0, common_1.Controller)('hotels'),
    __metadata("design:paramtypes", [hotels_service_1.HotelsService])
], HotelsController);
//# sourceMappingURL=hotels.controller.js.map