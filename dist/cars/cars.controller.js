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
exports.CarsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const cars_service_1 = require("./cars.service");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const client_1 = require("@prisma/client");
const multer_config_1 = require("../common/config/multer.config");
let CarsController = class CarsController {
    constructor(carsService) {
        this.carsService = carsService;
    }
    async searchCars(query) {
        return this.carsService.searchCars(query);
    }
    async findOne(id) {
        return this.carsService.findOne(id);
    }
    async calculatePrice(id, body) {
        return this.carsService.calculatePrice(id, body.pickup_location, body.dropoff_location, body.start_date, body.end_date, body.estimated_distance);
    }
    async createBookingRequest(req, body) {
        const userId = req.user.id;
        return this.carsService.createBookingRequest({
            ...body,
            user_id: userId,
        });
    }
    async respondToBooking(bookingId, req, body) {
        const driverId = req.user.id;
        return this.carsService.respondToBooking(bookingId, driverId, body.response, body.driver_notes);
    }
    async confirmBooking(bookingId, req) {
        const userId = req.user.id;
        return this.carsService.confirmBooking(bookingId, userId);
    }
    async getUserBookings(req, status) {
        const userId = req.user.id;
        return this.carsService.getUserBookings(userId, status);
    }
    async getDriverBookings(req, status) {
        const driverId = req.user.id;
        return this.carsService.getDriverBookings(driverId, status);
    }
    async startTrip(bookingId, req, body) {
        const driverId = req.user.id;
        return this.carsService.startTrip(bookingId, driverId, body.otp_code);
    }
    async completeTrip(bookingId, req) {
        const driverId = req.user.id;
        return this.carsService.completeTrip(bookingId, driverId);
    }
    async getChatMessages(bookingId, req) {
        const userId = req.user.id;
        return this.carsService.getChatMessages(bookingId, userId);
    }
    async sendMessage(bookingId, req, body) {
        const senderId = req.user.id;
        return this.carsService.sendMessage(bookingId, senderId, body.message);
    }
    async addCar(req, body) {
        const driverId = req.user.id;
        return this.carsService.addDriverCar(driverId, body);
    }
    async updateCar(id, req, body) {
        const driverId = req.user.id;
        return this.carsService.updateDriverCar(driverId, id, body);
    }
    async getDriverCars(req) {
        const driverId = req.user.id;
        return this.carsService.getDriverCars(driverId);
    }
    async getAllCars(query) {
        return this.carsService.getAllCarsForAdmin(query);
    }
    async verifyDriver(id, body) {
        return this.carsService.verifyDriverForAdmin(id, body);
    }
    async uploadCarImages(carId, files, req) {
        if (!files || files.length === 0) {
            throw new common_1.BadRequestException('No files uploaded');
        }
        const car = await this.carsService.findOne(carId);
        if (car.driver.id !== req.user.id) {
            throw new common_1.BadRequestException('You can only upload images to your own cars');
        }
        return this.carsService.uploadCarImages(carId, files);
    }
    async removeCarImageWithCloudinary(carId, imageId, req) {
        const car = await this.carsService.findOne(carId);
        if (car.driver.id !== req.user.id) {
            throw new common_1.BadRequestException('You can only delete images from your own cars');
        }
        return this.carsService.removeCarImageWithCloudinary(carId, imageId);
    }
    async getOptimizedCarImages(carId) {
        return this.carsService.getOptimizedCarImages(carId);
    }
    health() {
        return { ok: true, service: 'cars' };
    }
};
exports.CarsController = CarsController;
__decorate([
    (0, common_1.Get)('search'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "searchCars", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/calculate-price'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "calculatePrice", null);
__decorate([
    (0, common_1.Post)('bookings/request'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.client),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "createBookingRequest", null);
__decorate([
    (0, common_1.Post)('bookings/:id/respond'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Request)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "respondToBooking", null);
__decorate([
    (0, common_1.Post)('bookings/:id/confirm'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.client),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "confirmBooking", null);
__decorate([
    (0, common_1.Get)('bookings/my-bookings'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.client),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "getUserBookings", null);
__decorate([
    (0, common_1.Get)('bookings/driver-bookings'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "getDriverBookings", null);
__decorate([
    (0, common_1.Post)('bookings/:id/start'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Request)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "startTrip", null);
__decorate([
    (0, common_1.Post)('bookings/:id/complete'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "completeTrip", null);
__decorate([
    (0, common_1.Get)('bookings/:id/chat'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "getChatMessages", null);
__decorate([
    (0, common_1.Post)('bookings/:id/chat/messages'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Request)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "sendMessage", null);
__decorate([
    (0, common_1.Post)('driver/cars'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "addCar", null);
__decorate([
    (0, common_1.Patch)('driver/cars/:id'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Request)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "updateCar", null);
__decorate([
    (0, common_1.Get)('driver/cars'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "getDriverCars", null);
__decorate([
    (0, common_1.Get)('admin/all'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "getAllCars", null);
__decorate([
    (0, common_1.Patch)('admin/drivers/:id/verify'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.admin),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "verifyDriver", null);
__decorate([
    (0, common_1.Post)(':carId/images/upload'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('images', 10, multer_config_1.imageUploadConfig)),
    __param(0, (0, common_1.Param)('carId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.UploadedFiles)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Array, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "uploadCarImages", null);
__decorate([
    (0, common_1.Delete)(':carId/images/:imageId/cloudinary'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.driver),
    __param(0, (0, common_1.Param)('carId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('imageId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, Object]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "removeCarImageWithCloudinary", null);
__decorate([
    (0, common_1.Get)(':carId/images/optimized'),
    __param(0, (0, common_1.Param)('carId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], CarsController.prototype, "getOptimizedCarImages", null);
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CarsController.prototype, "health", null);
exports.CarsController = CarsController = __decorate([
    (0, common_1.Controller)('cars'),
    __metadata("design:paramtypes", [cars_service_1.CarsService])
], CarsController);
//# sourceMappingURL=cars.controller.js.map