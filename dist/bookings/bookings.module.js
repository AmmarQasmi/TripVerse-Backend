"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingsModule = void 0;
const common_1 = require("@nestjs/common");
const hotel_bookings_controller_1 = require("./hotel-bookings.controller");
const car_bookings_controller_1 = require("./car-bookings.controller");
const bookings_service_1 = require("./bookings.service");
const prisma_service_1 = require("../prisma/prisma.service");
const roles_guard_1 = require("../common/guards/roles.guard");
const auth_module_1 = require("../auth/auth.module");
let BookingsModule = class BookingsModule {
};
exports.BookingsModule = BookingsModule;
exports.BookingsModule = BookingsModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule],
        controllers: [hotel_bookings_controller_1.HotelBookingsController, car_bookings_controller_1.CarBookingsController],
        providers: [bookings_service_1.BookingsService, prisma_service_1.PrismaService, roles_guard_1.RolesGuard],
        exports: [bookings_service_1.BookingsService],
    })
], BookingsModule);
//# sourceMappingURL=bookings.module.js.map