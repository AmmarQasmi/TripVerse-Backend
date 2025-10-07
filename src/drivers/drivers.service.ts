import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { VerifyDriverDto } from './dto/verify-driver.dto';

@Injectable()
export class DriversService {
	constructor(private prisma: PrismaService) {}

	// Driver submits verification documents
	async submitVerification(userId: number, dto: SubmitVerificationDto) {
		// Check if driver exists
		const driver = await this.prisma.driver.findFirst({
			where: { user_id: userId },
		});

		if (!driver) {
			throw new NotFoundException('Driver profile not found');
		}

		// Validate rating is 4.0 or higher
		if (dto.existing_rating < 4.0) {
			throw new BadRequestException('Existing rating must be 4.0 or higher for verification');
		}

		// Update driver with verification documents
		const updatedDriver = await this.prisma.driver.update({
			where: { id: driver.id },
			data: {
				license_image_url: dto.license_image_url,
				rating_screenshot_url: dto.rating_screenshot_url,
				rating_platform: dto.rating_platform,
				existing_rating: dto.existing_rating,
			},
			include: {
				user: {
					select: {
						id: true,
						email: true,
						full_name: true,
						role: true,
					},
				},
			},
		});

		return {
			message: 'Verification documents submitted successfully. Awaiting admin approval.',
			driver: updatedDriver,
		};
	}

	// Admin verifies driver
	async verifyDriver(driverId: number, dto: VerifyDriverDto) {
		const driver = await this.prisma.driver.findUnique({
			where: { id: driverId },
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		// Check if driver has submitted verification documents
		if (!driver.license_image_url || !driver.rating_screenshot_url) {
			throw new BadRequestException('Driver has not submitted verification documents yet');
		}

		const updatedDriver = await this.prisma.driver.update({
			where: { id: driverId },
			data: {
				is_verified: dto.is_verified,
				verification_notes: dto.verification_notes,
				verified_at: dto.is_verified ? new Date() : null,
			},
			include: {
				user: {
					select: {
						id: true,
						email: true,
						full_name: true,
					},
				},
			},
		});

		return {
			message: dto.is_verified ? 'Driver verified successfully' : 'Driver verification rejected',
			driver: updatedDriver,
		};
	}

	// Get driver profile with verification status
	async getDriverProfile(userId: number) {
		const driver = await this.prisma.driver.findFirst({
			where: { user_id: userId },
			include: {
				user: {
					select: {
						id: true,
						email: true,
						full_name: true,
						region: true,
					},
				},
				cars: true,
			},
		});

		if (!driver) {
			throw new NotFoundException('Driver profile not found');
		}

		return driver;
	}

	// Admin: Get all drivers pending verification
	async getPendingVerifications() {
		return this.prisma.driver.findMany({
			where: {
				is_verified: false,
				license_image_url: { not: null },
				rating_screenshot_url: { not: null },
			},
			include: {
				user: {
					select: {
						id: true,
						email: true,
						full_name: true,
						region: true,
					},
				},
			},
			orderBy: {
				created_at: 'desc',
			},
		});
	}

	// Admin: Get all verified drivers
	async getVerifiedDrivers() {
		return this.prisma.driver.findMany({
			where: { is_verified: true },
			include: {
				user: {
					select: {
						id: true,
						email: true,
						full_name: true,
						region: true,
					},
				},
				cars: true,
			},
			orderBy: {
				verified_at: 'desc',
			},
		});
	}
}


