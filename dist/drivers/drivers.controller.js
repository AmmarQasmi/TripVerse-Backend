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
exports.DriversController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const drivers_service_1 = require("./drivers.service");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const client_1 = require("@prisma/client");
const submit_verification_dto_1 = require("./dto/submit-verification.dto");
const multer_config_1 = require("../common/config/multer.config");
let DriversController = class DriversController {
    constructor(driversService) {
        this.driversService = driversService;
    }
    health() {
        return { ok: true, service: 'drivers' };
    }
    async getDriverProfile(user) {
        return this.driversService.getDriverProfile(user.id);
    }
    async submitVerification(user, dto) {
        return this.driversService.submitVerification(user.id, dto);
    }
    async uploadDocument(user, file, documentType) {
        if (!file) {
            throw new common_1.BadRequestException('No file uploaded or invalid file type. Only JPG, JPEG, PNG, GIF, WEBP, and PDF files are allowed.');
        }
        if (!documentType) {
            throw new common_1.BadRequestException('Document type is required');
        }
        const validTypes = ['license', 'cnic', 'vehicle_registration', 'insurance', 'other'];
        if (!validTypes.includes(documentType)) {
            throw new common_1.BadRequestException(`Invalid document type. Valid types: ${validTypes.join(', ')}`);
        }
        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/pdf',
        ];
        if (file.mimetype && !allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
            throw new common_1.BadRequestException(`Invalid file type: ${file.originalname}. Only JPG, JPEG, PNG, GIF, WEBP, and PDF files are allowed.`);
        }
        return this.driversService.uploadDocument(user.id, file, documentType);
    }
    async deleteDocument(user, documentId) {
        return this.driversService.deleteDocument(user.id, documentId);
    }
    async getDriverDashboard(user) {
        return this.driversService.getDriverDashboard(user.id);
    }
    async getDriverEarnings(user, dateFrom, dateTo) {
        const from = dateFrom ? new Date(dateFrom) : undefined;
        const to = dateTo ? new Date(dateTo) : undefined;
        return this.driversService.getDriverEarnings(user.id, from, to);
    }
    async getEarningsBreakdown(user) {
        return this.driversService.getEarningsBreakdown(user.id);
    }
    async getSuspensionStatus(user) {
        return this.driversService.getSuspensionStatus(user.id);
    }
};
exports.DriversController = DriversController;
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DriversController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('profile'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "getDriverProfile", null);
__decorate([
    (0, common_1.Post)('verification/submit'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, submit_verification_dto_1.SubmitVerificationDto]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "submitVerification", null);
__decorate([
    (0, common_1.Post)('documents/upload'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('document', multer_config_1.multerConfig)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Query)('documentType')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "uploadDocument", null);
__decorate([
    (0, common_1.Delete)('documents/:documentId'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('documentId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "deleteDocument", null);
__decorate([
    (0, common_1.Get)('dashboard'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "getDriverDashboard", null);
__decorate([
    (0, common_1.Get)('earnings'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('date_from')),
    __param(2, (0, common_1.Query)('date_to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "getDriverEarnings", null);
__decorate([
    (0, common_1.Get)('earnings/breakdown'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "getEarningsBreakdown", null);
__decorate([
    (0, common_1.Get)('suspension-status'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "getSuspensionStatus", null);
exports.DriversController = DriversController = __decorate([
    (0, common_1.Controller)('drivers'),
    __metadata("design:paramtypes", [drivers_service_1.DriversService])
], DriversController);
//# sourceMappingURL=drivers.controller.js.map