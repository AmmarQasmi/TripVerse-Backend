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
exports.HotelBookingsController = void 0;
const common_1 = require("@nestjs/common");
const bookings_service_1 = require("./bookings.service");
const prisma_service_1 = require("../prisma/prisma.service");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const client_1 = require("@prisma/client");
let HotelBookingsController = class HotelBookingsController {
    constructor(bookingsService, prisma) {
        this.bookingsService = bookingsService;
        this.prisma = prisma;
    }
    async createBookingRequest(req, body) {
        const userId = req.user.id;
        return this.bookingsService.createHotelBookingRequest({
            ...body,
            user_id: userId,
        });
    }
    async getUserBookings(req, status) {
        const userId = req.user.id;
        return this.bookingsService.getUserHotelBookings(userId, status);
    }
    async getBookingDetails(id, req) {
        const userId = req.user.id;
        return this.bookingsService.getHotelBookingById(id, userId);
    }
    async confirmBooking(id, req) {
        const userId = req.user.id;
        return this.bookingsService.confirmHotelBooking(id, userId);
    }
    async cancelBooking(id, req) {
        const userId = req.user.id;
        return this.bookingsService.cancelHotelBooking(id, userId);
    }
    async getManagerBookings(req, status) {
        const hotelManager = await this.prisma.hotelManager.findFirst({
            where: { user_id: req.user.id },
        });
        if (!hotelManager) {
            throw new Error('Hotel manager profile not found');
        }
        return this.bookingsService.getManagerHotelBookings(hotelManager.id, status);
    }
    async getManagerStats(req, dateFrom, dateTo) {
        const hotelManager = await this.prisma.hotelManager.findFirst({
            where: { user_id: req.user.id },
        });
        if (!hotelManager) {
            throw new Error('Hotel manager profile not found');
        }
        const from = dateFrom ? new Date(dateFrom) : undefined;
        const to = dateTo ? new Date(dateTo) : undefined;
        return this.bookingsService.getManagerBookingStats(hotelManager.id, from, to);
    }
    async getAllBookings(query) {
        return this.bookingsService.getAllHotelBookingsForAdmin(query);
    }
    health() {
        return { ok: true, service: 'hotel-bookings' };
    }
};
exports.HotelBookingsController = HotelBookingsController;
__decorate([
    (0, common_1.Post)('request'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.client),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], HotelBookingsController.prototype, "createBookingRequest", null);
__decorate([
    (0, common_1.Get)('my-bookings'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.client),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], HotelBookingsController.prototype, "getUserBookings", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], HotelBookingsController.prototype, "getBookingDetails", null);
__decorate([
    (0, common_1.Post)(':id/confirm'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.client),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], HotelBookingsController.prototype, "confirmBooking", null);
__decorate([
    (0, common_1.Patch)(':id/cancel'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.client),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], HotelBookingsController.prototype, "cancelBooking", null);
__decorate([
    (0, common_1.Get)('manager/bookings'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.hotel_manager),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], HotelBookingsController.prototype, "getManagerBookings", null);
__decorate([
    (0, common_1.Get)('manager/stats'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.hotel_manager),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('dateFrom')),
    __param(2, (0, common_1.Query)('dateTo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], HotelBookingsController.prototype, "getManagerStats", null);
__decorate([
    (0, common_1.Get)('admin/all'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], HotelBookingsController.prototype, "getAllBookings", null);
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HotelBookingsController.prototype, "health", null);
exports.HotelBookingsController = HotelBookingsController = __decorate([
    (0, common_1.Controller)('hotel-bookings'),
    __metadata("design:paramtypes", [bookings_service_1.BookingsService,
        prisma_service_1.PrismaService])
], HotelBookingsController);
//# sourceMappingURL=hotel-bookings.controller.js.map