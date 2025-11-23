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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const admin_service_1 = require("./admin.service");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const client_1 = require("@prisma/client");
const verify_driver_dto_1 = require("../drivers/dto/verify-driver.dto");
const verify_manager_dto_1 = require("../hotel-managers/dto/verify-manager.dto");
const suspend_driver_dto_1 = require("./dto/suspend-driver.dto");
const ban_driver_dto_1 = require("./dto/ban-driver.dto");
const resolve_dispute_dto_1 = require("./dto/resolve-dispute.dto");
const driver_filters_dto_1 = require("./dto/driver-filters.dto");
const dispute_filters_dto_1 = require("./dto/dispute-filters.dto");
const create_dispute_dto_1 = require("./dto/create-dispute.dto");
let AdminController = class AdminController {
    constructor(adminService) {
        this.adminService = adminService;
    }
    health() {
        return { ok: true, service: 'admin' };
    }
    async getDashboard(user) {
        return this.adminService.getDashboardStats();
    }
    async getAllDrivers(filters) {
        return this.adminService.getAllDrivers(filters);
    }
    async getPendingVerifications() {
        return this.adminService.getAllDrivers({ status: 'pending' });
    }
    async getVerifiedDrivers() {
        return this.adminService.getAllDrivers({ is_verified: true });
    }
    async getDriversWithPendingSuspensions() {
        return this.adminService.getDriversWithPendingSuspensions();
    }
    async getDriverDisciplinaryHistory(driverId) {
        return this.adminService.getDriverDisciplinaryHistory(driverId);
    }
    async getDriverDetails(driverId) {
        return this.adminService.getDriverDetails(driverId);
    }
    async verifyDriver(driverId, dto, user) {
        return this.adminService.verifyDriver(driverId, dto, user.id);
    }
    async suspendDriver(driverId, dto) {
        return this.adminService.suspendDriver(driverId, dto);
    }
    async banDriver(driverId, dto) {
        return this.adminService.banDriver(driverId, dto);
    }
    async createDispute(dto, user) {
        if (!dto.raised_by) {
            if (user.role === 'client') {
                dto.raised_by = 'client';
            }
            else if (user.role === 'driver') {
                dto.raised_by = 'driver';
            }
            else {
                dto.raised_by = 'admin';
            }
        }
        return this.adminService.createDispute(dto);
    }
    async getAllDisputes(filters) {
        return this.adminService.getAllDisputes(filters);
    }
    async getDisputeById(disputeId) {
        return this.adminService.getDisputeById(disputeId);
    }
    async resolveDispute(disputeId, dto) {
        return this.adminService.resolveDispute(disputeId, dto);
    }
    async getBookingStats(from, to) {
        const dateRange = {};
        if (from)
            dateRange.from = new Date(from);
        if (to)
            dateRange.to = new Date(to);
        return this.adminService.getBookingStats(dateRange);
    }
    async getDriverPerformanceStats() {
        return this.adminService.getDriverPerformanceStats();
    }
    async getRevenueReport(from, to) {
        const dateRange = {};
        if (from)
            dateRange.from = new Date(from);
        if (to)
            dateRange.to = new Date(to);
        return this.adminService.getRevenueReport(dateRange);
    }
    async getAllUsers(query) {
        return this.adminService.getAllUsers(query);
    }
    async getAllHotels(query) {
        return this.adminService.getAllHotels(query);
    }
    async getHotelDetails(id) {
        return this.adminService.getHotelDetails(id);
    }
    async updateHotel(id, data) {
        return this.adminService.updateHotel(id, data);
    }
    async deleteHotel(id) {
        return this.adminService.deleteHotel(id);
    }
    async getAllHotelManagers(query) {
        return this.adminService.getAllHotelManagers(query);
    }
    async getHotelManagerDetails(id) {
        return this.adminService.getHotelManagerDetails(id);
    }
    async verifyHotelManager(id, dto, user) {
        const result = await this.adminService.verifyHotelManager(id, dto);
        if (result.hotel_manager) {
            await this.adminService.updateDocumentReviewer(id, user.id);
        }
        return result;
    }
    async getPendingHotelManagers() {
        return this.adminService.getPendingHotelManagers();
    }
    async getVerifiedHotelManagers() {
        return this.adminService.getVerifiedHotelManagers();
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('dashboard'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getDashboard", null);
__decorate([
    (0, common_1.Get)('drivers'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [driver_filters_dto_1.DriverFiltersDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getAllDrivers", null);
__decorate([
    (0, common_1.Get)('drivers/verification/pending'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getPendingVerifications", null);
__decorate([
    (0, common_1.Get)('drivers/verification/verified'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getVerifiedDrivers", null);
__decorate([
    (0, common_1.Get)('drivers/pending-suspensions'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getDriversWithPendingSuspensions", null);
__decorate([
    (0, common_1.Get)('drivers/:id/disciplinary-history'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getDriverDisciplinaryHistory", null);
__decorate([
    (0, common_1.Get)('drivers/:id'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getDriverDetails", null);
__decorate([
    (0, common_1.Put)('drivers/:id/verify'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, verify_driver_dto_1.VerifyDriverDto, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "verifyDriver", null);
__decorate([
    (0, common_1.Patch)('drivers/:id/suspend'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, suspend_driver_dto_1.SuspendDriverDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "suspendDriver", null);
__decorate([
    (0, common_1.Patch)('drivers/:id/ban'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, ban_driver_dto_1.BanDriverDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "banDriver", null);
__decorate([
    (0, common_1.Post)('disputes'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_dispute_dto_1.CreateDisputeDto, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createDispute", null);
__decorate([
    (0, common_1.Get)('disputes'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dispute_filters_dto_1.DisputeFiltersDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getAllDisputes", null);
__decorate([
    (0, common_1.Get)('disputes/:id'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getDisputeById", null);
__decorate([
    (0, common_1.Patch)('disputes/:id/resolve'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, resolve_dispute_dto_1.ResolveDisputeDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "resolveDispute", null);
__decorate([
    (0, common_1.Get)('reports/bookings'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getBookingStats", null);
__decorate([
    (0, common_1.Get)('reports/drivers'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getDriverPerformanceStats", null);
__decorate([
    (0, common_1.Get)('reports/revenue'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getRevenueReport", null);
__decorate([
    (0, common_1.Get)('users'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getAllUsers", null);
__decorate([
    (0, common_1.Get)('hotels'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getAllHotels", null);
__decorate([
    (0, common_1.Get)('hotels/:id'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getHotelDetails", null);
__decorate([
    (0, common_1.Patch)('hotels/:id'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateHotel", null);
__decorate([
    (0, common_1.Delete)('hotels/:id'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteHotel", null);
__decorate([
    (0, common_1.Get)('hotel-managers'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getAllHotelManagers", null);
__decorate([
    (0, common_1.Get)('hotel-managers/:id'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getHotelManagerDetails", null);
__decorate([
    (0, common_1.Put)('hotel-managers/:id/verify'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, verify_manager_dto_1.VerifyHotelManagerDto, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "verifyHotelManager", null);
__decorate([
    (0, common_1.Get)('hotel-managers/pending'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getPendingHotelManagers", null);
__decorate([
    (0, common_1.Get)('hotel-managers/verified'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getVerifiedHotelManagers", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map