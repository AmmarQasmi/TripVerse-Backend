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

		// Validate all ratings are 4.0 or higher
		for (const rating of dto.ratings) {
			if (rating.rating < 4.0) {
				throw new BadRequestException(`Rating for ${rating.platform} must be 4.0 or higher for verification`);
			}
		}

		// Create documents in a transaction
		await this.prisma.$transaction(async (tx) => {
			// Create driver documents
			for (const doc of dto.documents) {
				await tx.driverDocument.create({
					data: {
						driver_id: driver.id,
						document_type: doc.document_type,
						document_url: doc.document_url,
						status: 'pending',
					},
				});
			}

			// Create driver ratings
			for (const rating of dto.ratings) {
				await tx.driverRating.create({
					data: {
						driver_id: driver.id,
						platform: rating.platform,
						rating: rating.rating,
						screenshot_url: rating.screenshot_url,
					},
				});
			}
		});

		// Get updated driver with documents and ratings
		const updatedDriver = await this.prisma.driver.findUnique({
			where: { id: driver.id },
			include: {
				user: {
					select: {
						id: true,
						email: true,
						full_name: true,
						role: true,
						status: true,
						city: true,
					},
				},
				documents: {
					orderBy: { uploaded_at: 'desc' },
				},
				ratings: {
					orderBy: { created_at: 'desc' },
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
			include: {
				documents: true,
				ratings: true,
			},
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		// Check if driver has submitted documents and ratings
		if (driver.documents.length === 0 || driver.ratings.length === 0) {
			throw new BadRequestException('Driver has not submitted verification documents yet');
		}

		// Check if driver has at least a license document
		const hasLicense = driver.documents.some((doc) => doc.document_type === 'license');
		if (!hasLicense) {
			throw new BadRequestException('Driver must submit a license document');
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
						status: true,
						city: true,
					},
				},
				documents: {
					orderBy: { uploaded_at: 'desc' },
				},
				ratings: {
					orderBy: { created_at: 'desc' },
				},
			},
		});

		// If verifying, approve all pending documents
		if (dto.is_verified) {
			await this.prisma.driverDocument.updateMany({
				where: {
					driver_id: driverId,
					status: 'pending',
				},
				data: {
					status: 'approved',
					reviewed_at: new Date(),
				},
			});

			// Mark all ratings as verified
			await this.prisma.driverRating.updateMany({
				where: {
					driver_id: driverId,
					verified_at: null,
				},
				data: {
					verified_at: new Date(),
				},
			});
		}

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
						status: true,
						city: true,
					},
				},
				cars: {
					include: {
						carModel: true,
						images: {
							orderBy: { display_order: 'asc' },
						},
					},
				},
				documents: {
					orderBy: { uploaded_at: 'desc' },
				},
				ratings: {
					orderBy: { created_at: 'desc' },
				},
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
				documents: {
					some: {
						status: 'pending',
					},
				},
			},
			include: {
				user: {
					select: {
						id: true,
						email: true,
						full_name: true,
						status: true,
						city: true,
					},
				},
				documents: {
					where: { status: 'pending' },
					orderBy: { uploaded_at: 'desc' },
				},
				ratings: {
					where: { verified_at: null },
					orderBy: { created_at: 'desc' },
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
						status: true,
						city: true,
					},
				},
				cars: {
					include: {
						carModel: true,
						images: {
							orderBy: { display_order: 'asc' },
						},
					},
				},
				documents: {
					where: { status: 'approved' },
					orderBy: { uploaded_at: 'desc' },
				},
				ratings: {
					where: { verified_at: { not: null } },
					orderBy: { created_at: 'desc' },
				},
			},
			orderBy: {
				verified_at: 'desc',
			},
		});
	}
}




