import {
	Controller,
	Get,
	Post,
	Delete,
	Body,
	Param,
	Query,
	UseGuards,
	UseInterceptors,
	UploadedFile,
	BadRequestException,
	ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HotelManagersService } from './hotel-managers.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { multerConfig } from '../common/config/multer.config';

@Controller('hotel-managers')
export class HotelManagersController {
	constructor(private readonly hotelManagersService: HotelManagersService) {}

	@Get('health')
	health() {
		return { ok: true, service: 'hotel-managers' };
	}

	// Hotel Manager: Get own profile with verification status
	@Get('profile')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	async getHotelManagerProfile(@CurrentUser() user: any) {
		return this.hotelManagersService.getHotelManagerProfile(user.id);
	}

	// Hotel Manager: Submit verification documents
	@Post('verification/submit')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	async submitVerification(@CurrentUser() user: any, @Body() dto: SubmitVerificationDto) {
		return this.hotelManagersService.submitVerification(user.id, dto);
	}

	/**
	 * Upload hotel manager document to Cloudinary (Hotel Manager only)
	 * POST /hotel-managers/documents/upload?documentType=hotel_registration
	 */
	@Post('documents/upload')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	@UseInterceptors(FileInterceptor('document', multerConfig))
	async uploadDocument(
		@CurrentUser() user: any,
		@UploadedFile() file: Express.Multer.File,
		@Query('documentType') documentType: string,
	) {
		if (!file) {
			throw new BadRequestException('No file uploaded or invalid file type. Only JPG, JPEG, PNG, GIF, WEBP, and PDF files are allowed.');
		}

		if (!documentType) {
			throw new BadRequestException('Document type is required');
		}

		const validTypes = ['hotel_registration', 'business_license', 'tax_certificate'];
		if (!validTypes.includes(documentType)) {
			throw new BadRequestException(`Invalid document type. Valid types: ${validTypes.join(', ')}`);
		}

		// Validate file type (images or PDF)
		const allowedMimeTypes = [
			'image/jpeg',
			'image/jpg',
			'image/png',
			'image/gif',
			'image/webp',
			'application/pdf',
		];
		if (file.mimetype && !allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
			throw new BadRequestException(`Invalid file type: ${file.originalname}. Only JPG, JPEG, PNG, GIF, WEBP, and PDF files are allowed.`);
		}

		return this.hotelManagersService.uploadDocument(user.id, file, documentType);
	}

	/**
	 * Delete hotel manager document from Cloudinary and database (Hotel Manager only)
	 * DELETE /hotel-managers/documents/:documentId
	 */
	@Delete('documents/:documentId')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	async deleteDocument(
		@CurrentUser() user: any,
		@Param('documentId', ParseIntPipe) documentId: number,
	) {
		return this.hotelManagersService.deleteDocument(user.id, documentId);
	}

	/**
	 * Get hotel manager dashboard
	 * GET /hotel-managers/dashboard
	 */
	@Get('dashboard')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	async getDashboard(@CurrentUser() user: any) {
		return this.hotelManagersService.getHotelManagerDashboard(user.id);
	}

	/**
	 * Get hotel manager earnings
	 * GET /hotel-managers/earnings?dateFrom=2024-01-01&dateTo=2024-12-31
	 */
	@Get('earnings')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	async getEarnings(
		@CurrentUser() user: any,
		@Query('dateFrom') dateFrom?: string,
		@Query('dateTo') dateTo?: string,
	) {
		const from = dateFrom ? new Date(dateFrom) : undefined;
		const to = dateTo ? new Date(dateTo) : undefined;
		return this.hotelManagersService.getHotelManagerEarnings(user.id, from, to);
	}

	/**
	 * Get earnings breakdown by period and hotel
	 * GET /hotel-managers/earnings/breakdown
	 */
	@Get('earnings/breakdown')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	async getEarningsBreakdown(@CurrentUser() user: any) {
		return this.hotelManagersService.getEarningsBreakdown(user.id);
	}
}

