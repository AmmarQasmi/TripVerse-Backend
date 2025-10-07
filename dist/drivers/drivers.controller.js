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
const drivers_service_1 = require("./drivers.service");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const client_1 = require("@prisma/client");
const submit_verification_dto_1 = require("./dto/submit-verification.dto");
const verify_driver_dto_1 = require("./dto/verify-driver.dto");
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
    async getPendingVerifications() {
        return this.driversService.getPendingVerifications();
    }
    async getVerifiedDrivers() {
        return this.driversService.getVerifiedDrivers();
    }
    async verifyDriver(driverId, dto) {
        return this.driversService.verifyDriver(Number(driverId), dto);
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
    (0, common_1.Get)('verification/pending'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "getPendingVerifications", null);
__decorate([
    (0, common_1.Get)('verification/verified'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "getVerifiedDrivers", null);
__decorate([
    (0, common_1.Put)('verification/:driverId'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('driverId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, verify_driver_dto_1.VerifyDriverDto]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "verifyDriver", null);
exports.DriversController = DriversController = __decorate([
    (0, common_1.Controller)('drivers'),
    __metadata("design:paramtypes", [drivers_service_1.DriversService])
], DriversController);
//# sourceMappingURL=drivers.controller.js.map