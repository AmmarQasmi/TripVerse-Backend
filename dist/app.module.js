"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const cities_module_1 = require("./cities/cities.module");
const hotels_module_1 = require("./hotels/hotels.module");
const cars_module_1 = require("./cars/cars.module");
const drivers_module_1 = require("./drivers/drivers.module");
const hotel_managers_module_1 = require("./hotel-managers/hotel-managers.module");
const bookings_module_1 = require("./bookings/bookings.module");
const payments_module_1 = require("./payments/payments.module");
const monuments_module_1 = require("./monuments/monuments.module");
const weather_module_1 = require("./weather/weather.module");
const admin_module_1 = require("./admin/admin.module");
const cloudinary_module_1 = require("./common/cloudinary/cloudinary.module");
const upload_module_1 = require("./common/upload/upload.module");
const notifications_module_1 = require("./notifications/notifications.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env',
            }),
            schedule_1.ScheduleModule.forRoot(),
            prisma_module_1.PrismaModule,
            cloudinary_module_1.CloudinaryModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            cities_module_1.CitiesModule,
            hotels_module_1.HotelsModule,
            cars_module_1.CarsModule,
            drivers_module_1.DriversModule,
            hotel_managers_module_1.HotelManagersModule,
            bookings_module_1.BookingsModule,
            payments_module_1.PaymentsModule,
            monuments_module_1.MonumentsModule,
            weather_module_1.WeatherModule,
            admin_module_1.AdminModule,
            upload_module_1.UploadModule,
            notifications_module_1.NotificationsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map