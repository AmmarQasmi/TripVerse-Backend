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
exports.MonumentsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const monuments_service_1 = require("./monuments.service");
const export_service_1 = require("../common/services/export.service");
const auth_guard_1 = require("../common/guards/auth.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const response_util_1 = require("../common/utils/response.util");
const constants_1 = require("../common/utils/constants");
let MonumentsController = class MonumentsController {
    constructor(monumentsService, exportService) {
        this.monumentsService = monumentsService;
        this.exportService = exportService;
    }
    health() {
        return { ok: true, service: 'monuments' };
    }
    async uploadMonument(file, user) {
        if (!file) {
            throw new common_1.BadRequestException('No image file provided');
        }
        return await this.monumentsService.recognizeMonument(user.id, file.buffer, file.originalname);
    }
    async getMyRecognitions(user, page = '1', limit = '10') {
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        return await this.monumentsService.getUserRecognitions(user.id, pageNum, limitNum);
    }
    async getRecognition(id, user) {
        return await this.monumentsService.getRecognition(user.id, id);
    }
    async deleteRecognition(id, user) {
        await this.monumentsService.deleteRecognition(user.id, id);
        return (0, response_util_1.successResponse)(null, 'Monument recognition deleted successfully');
    }
    async exportPDF(id, user) {
        const recognition = await this.monumentsService.getRecognition(user.id, id);
        const pdfBuffer = await this.exportService.generatePDF(recognition);
        const uploadResult = await this.exportService.uploadExportFile(pdfBuffer, 'pdf', recognition.name);
        const exportLog = await this.monumentsService.logExport(user.id, id, 'pdf', uploadResult.url, pdfBuffer.length);
        return (0, response_util_1.successResponse)({
            exportId: exportLog.id,
            downloadUrl: uploadResult.url,
            format: 'pdf',
            fileSize: pdfBuffer.length,
        }, 'PDF export generated successfully');
    }
    async exportDOCX(id, user) {
        const recognition = await this.monumentsService.getRecognition(user.id, id);
        const docxBuffer = await this.exportService.generateDOCX(recognition);
        const uploadResult = await this.exportService.uploadExportFile(docxBuffer, 'docx', recognition.name);
        const exportLog = await this.monumentsService.logExport(user.id, id, 'docx', uploadResult.url, docxBuffer.length);
        return (0, response_util_1.successResponse)({
            exportId: exportLog.id,
            downloadUrl: uploadResult.url,
            format: 'docx',
            fileSize: docxBuffer.length,
        }, 'DOCX export generated successfully');
    }
    async getExportHistory(user, page = '1', limit = '10') {
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        return await this.monumentsService.getUserExports(user.id, pageNum, limitNum);
    }
};
exports.MonumentsController = MonumentsController;
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MonumentsController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('image', {
        limits: {
            fileSize: constants_1.FILE_LIMITS.MAX_SIZE,
        },
        fileFilter: (req, file, callback) => {
            if (constants_1.FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
                callback(null, true);
            }
            else {
                callback(new common_1.BadRequestException('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
            }
        },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MonumentsController.prototype, "uploadMonument", null);
__decorate([
    (0, common_1.Get)('my-recognitions'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], MonumentsController.prototype, "getMyRecognitions", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], MonumentsController.prototype, "getRecognition", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], MonumentsController.prototype, "deleteRecognition", null);
__decorate([
    (0, common_1.Post)(':id/export/pdf'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], MonumentsController.prototype, "exportPDF", null);
__decorate([
    (0, common_1.Post)(':id/export/docx'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], MonumentsController.prototype, "exportDOCX", null);
__decorate([
    (0, common_1.Get)('exports/history'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], MonumentsController.prototype, "getExportHistory", null);
exports.MonumentsController = MonumentsController = __decorate([
    (0, common_1.Controller)('monuments'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [monuments_service_1.MonumentsService,
        export_service_1.ExportService])
], MonumentsController);
//# sourceMappingURL=monuments.controller.js.map