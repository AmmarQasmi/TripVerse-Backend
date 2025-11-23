"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CarsModule = void 0;
const common_1 = require("@nestjs/common");
const cars_controller_1 = require("./cars.controller");
const cars_service_1 = require("./cars.service");
const roles_guard_1 = require("../common/guards/roles.guard");
const auth_module_1 = require("../auth/auth.module");
const cloudinary_module_1 = require("../common/cloudinary/cloudinary.module");
const notifications_module_1 = require("../notifications/notifications.module");
const admin_module_1 = require("../admin/admin.module");
let CarsModule = class CarsModule {
};
exports.CarsModule = CarsModule;
exports.CarsModule = CarsModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, cloudinary_module_1.CloudinaryModule, notifications_module_1.NotificationsModule, admin_module_1.AdminModule],
        controllers: [cars_controller_1.CarsController],
        providers: [cars_service_1.CarsService, roles_guard_1.RolesGuard],
        exports: [cars_service_1.CarsService],
    })
], CarsModule);
//# sourceMappingURL=cars.module.js.map