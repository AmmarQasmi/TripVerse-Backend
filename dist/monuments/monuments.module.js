"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonumentsModule = void 0;
const common_1 = require("@nestjs/common");
const monuments_controller_1 = require("./monuments.controller");
const monuments_service_1 = require("./monuments.service");
const prisma_module_1 = require("../prisma/prisma.module");
const cloudinary_module_1 = require("../common/cloudinary/cloudinary.module");
const google_vision_service_1 = require("../common/services/google-vision.service");
const wikipedia_service_1 = require("../common/services/wikipedia.service");
const lobstr_service_1 = require("../common/services/lobstr.service");
const export_service_1 = require("../common/services/export.service");
let MonumentsModule = class MonumentsModule {
};
exports.MonumentsModule = MonumentsModule;
exports.MonumentsModule = MonumentsModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, cloudinary_module_1.CloudinaryModule],
        controllers: [monuments_controller_1.MonumentsController],
        providers: [
            monuments_service_1.MonumentsService,
            google_vision_service_1.GoogleVisionService,
            wikipedia_service_1.WikipediaService,
            lobstr_service_1.LobstrService,
            export_service_1.ExportService,
        ],
        exports: [monuments_service_1.MonumentsService],
    })
], MonumentsModule);
//# sourceMappingURL=monuments.module.js.map