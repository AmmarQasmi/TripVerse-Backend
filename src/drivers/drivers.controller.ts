import {
	Controller,
	Get,
	Post,
	Put,
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
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { VerifyDriverDto } from './dto/verify-driver.dto';
import { multerConfig } from '../common/config/multer.config';

@Controller('drivers')
export class DriversController {
	constructor(private readonly driversService: DriversService) {}

	@Get('health')
	health() {
		return { ok: true, service: 'drivers' };
	}

	// Driver: Get own profile with verification status
	@Get('profile')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async getDriverProfile(@CurrentUser() user: any) {
		return this.driversService.getDriverProfile(user.id);
	}

	// Driver: Submit verification documents
	@Post('verification/submit')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async submitVerification(@CurrentUser() user: any, @Body() dto: SubmitVerificationDto) {
		return this.driversService.submitVerification(user.id, dto);
	}

	// Admin: Get drivers pending verification
	@Get('verification/pending')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getPendingVerifications() {
		return this.driversService.getPendingVerifications();
	}

	// Admin: Get all verified drivers
	@Get('verification/verified')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getVerifiedDrivers() {
		return this.driversService.getVerifiedDrivers();
	}

	// Admin: Verify or reject driver
	@Put('verification/:driverId')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async verifyDriver(@Param('driverId') driverId: string, @Body() dto: VerifyDriverDto) {
		return this.driversService.verifyDriver(Number(driverId), dto);
	}

	/**
	 * Upload driver document to Cloudinary (Driver only)
	 * POST /drivers/documents/upload?documentType=license
	 */
	@Post('documents/upload')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
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

		const validTypes = ['license', 'cnic', 'vehicle_registration', 'insurance', 'other'];
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

		return this.driversService.uploadDocument(user.id, file, documentType);
	}

	/**
	 * Delete driver document from Cloudinary and database (Driver only)
	 * DELETE /drivers/documents/:documentId
	 */
	@Delete('documents/:documentId')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async deleteDocument(
		@CurrentUser() user: any,
		@Param('documentId', ParseIntPipe) documentId: number,
	) {
		return this.driversService.deleteDocument(user.id, documentId);
	}
}


