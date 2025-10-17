"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotelsModule = void 0;
const common_1 = require("@nestjs/common");
const hotels_controller_1 = require("./hotels.controller");
const hotels_service_1 = require("./hotels.service");
const roles_guard_1 = require("../common/guards/roles.guard");
const auth_module_1 = require("../auth/auth.module");
let HotelsModule = class HotelsModule {
};
exports.HotelsModule = HotelsModule;
exports.HotelsModule = HotelsModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule],
        controllers: [hotels_controller_1.HotelsController],
        providers: [hotels_service_1.HotelsService, roles_guard_1.RolesGuard],
    })
], HotelsModule);
//# sourceMappingURL=hotels.module.js.map