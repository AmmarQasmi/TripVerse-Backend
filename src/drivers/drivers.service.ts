import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { NotificationsService as CommonNotificationsService } from '../common/services/notifications.service';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { VerifyDriverDto } from './dto/verify-driver.dto';

@Injectable()
export class DriversService {
	constructor(
		private prisma: PrismaService,
		private cloudinaryService: CloudinaryService,
		private notificationsService: CommonNotificationsService,
	) {}

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

		// Validate at least one rating has a screenshot
		const ratingsWithScreenshots = dto.ratings.filter(r => r.screenshot_url && r.screenshot_url.trim() !== '');
		if (ratingsWithScreenshots.length === 0) {
			throw new BadRequestException('At least one rating must include a screenshot');
		}

		// Note: Cannot use $transaction with PgBouncer transaction pooling mode
		// Instead, we'll create records sequentially and handle errors gracefully
		
		// Create driver documents (check for existing first to avoid duplicates)
			for (const doc of dto.documents) {
			// Check if document already exists
			const existingDoc = await this.prisma.driverDocument.findFirst({
				where: {
					driver_id: driver.id,
					document_type: doc.document_type,
				},
			});

			if (existingDoc) {
				// Update existing document
				await this.prisma.driverDocument.update({
					where: { id: existingDoc.id },
					data: {
						document_url: doc.document_url,
						status: 'pending',
						uploaded_at: new Date(),
					},
				});
			} else {
				// Create new document
				await this.prisma.driverDocument.create({
					data: {
						driver_id: driver.id,
						document_type: doc.document_type,
						document_url: doc.document_url,
						status: 'pending',
					},
				});
			}
			}

		// Create driver ratings (skip duplicates if retrying)
			for (const rating of dto.ratings) {
			// Check if rating already exists for this platform
			const existingRating = await this.prisma.driverRating.findFirst({
				where: {
					driver_id: driver.id,
					platform: rating.platform,
				},
			});

			if (existingRating) {
				// Update existing rating
				await this.prisma.driverRating.update({
					where: { id: existingRating.id },
					data: {
						rating: rating.rating,
						screenshot_url: rating.screenshot_url || null, // Allow null for optional screenshots
						verified_at: null, // Reset verification if updating
					},
				});
			} else {
				// Create new rating
				await this.prisma.driverRating.create({
					data: {
						driver_id: driver.id,
						platform: rating.platform,
						rating: rating.rating,
						screenshot_url: rating.screenshot_url || null, // Allow null for optional screenshots
					},
				});
			}
		}

		// Check if driver was previously rejected (has verification_notes)
		const wasRejected = driver.verification_notes && !driver.is_verified;
		
		// Check if all documents are now pending (re-uploaded after rejection)
		const allDocuments = await this.prisma.driverDocument.findMany({
			where: { driver_id: driver.id },
		});
		const allDocsPending = allDocuments.length > 0 && 
			allDocuments.every(doc => doc.status === 'pending');

		// If driver was previously rejected and is now re-submitting, clear verification_notes
		// This indicates a fresh submission after addressing rejection
		if (wasRejected && allDocsPending) {
			await this.prisma.driver.update({
				where: { id: driver.id },
				data: {
					verification_notes: null,
				},
			});
		}

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

		if (!updatedDriver) {
			throw new NotFoundException('Driver not found after submission');
		}

		// Notify all admins about the verification submission
		if (updatedDriver.user) {
			await this.notificationsService.notifyAdminsOfVerificationSubmission(
				'driver',
				updatedDriver.user.full_name,
				updatedDriver.user.email,
			);
		}

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
		} else {
			// Reject all pending documents if driver verification is rejected
			await this.prisma.driverDocument.updateMany({
				where: {
					driver_id: driverId,
					status: 'pending',
				},
				data: {
					status: 'rejected',
					rejection_reason: dto.verification_notes || 'Verification rejected by admin',
					reviewed_at: new Date(),
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

	/**
	 * Upload driver document to Cloudinary
	 */
	async uploadDocument(userId: number, file: any, documentType: string) {
		const driver = await this.prisma.driver.findFirst({
			where: { user_id: userId },
		});

		if (!driver) {
			throw new NotFoundException('Driver profile not found');
		}

		try {
			// Upload to Cloudinary
			const uploadResult = await this.cloudinaryService.uploadDocument(
				file,
				'driver-documents',
				{},
			) as any;

			// Save to database
			const document = await this.prisma.driverDocument.create({
				data: {
					driver_id: driver.id,
					document_type: documentType as any,
					document_url: uploadResult.secure_url,
					public_id: uploadResult.public_id,
					status: 'pending',
				} as any,
			}) as any;

			return {
				message: 'Document uploaded successfully',
				document: {
					id: document.id,
					document_type: document.document_type,
					document_url: document.document_url,
					public_id: document.public_id,
					status: document.status,
				},
			};
		} catch (error) {
			throw new BadRequestException('Failed to upload document');
		}
	}

	/**
	 * Delete driver document from Cloudinary and database
	 */
	async deleteDocument(userId: number, documentId: number) {
		const driver = await this.prisma.driver.findFirst({
			where: { user_id: userId },
		});

		if (!driver) {
			throw new NotFoundException('Driver profile not found');
		}

		const document = await this.prisma.driverDocument.findFirst({
			where: {
				id: documentId,
				driver_id: driver.id,
			},
		}) as any;

		if (!document) {
			throw new NotFoundException('Document not found');
		}

		try {
			// Delete from Cloudinary if public_id exists
			if (document.public_id) {
				await this.cloudinaryService.deleteImage(document.public_id);
			}

			// Delete from database
			await this.prisma.driverDocument.delete({
				where: { id: documentId },
			});

			return { message: 'Document deleted successfully' };
		} catch (error) {
			throw new BadRequestException('Failed to delete document');
		}
	}

	/**
	 * Get driver dashboard summary - optimized with parallel queries
	 */
	async getDriverDashboard(userId: number) {
		const driver = await this.prisma.driver.findFirst({
			where: { user_id: userId },
			select: {
				id: true,
				is_verified: true,
				verified_at: true,
			},
		});

		if (!driver) {
			throw new NotFoundException('Driver profile not found');
		}

		// Optimize: Run all queries in parallel
		const [
			incomingRequests,
			confirmedBookings,
			earningsResult,
			carsCount,
			activeCarsCount,
			recentBookings,
		] = await Promise.all([
			// Incoming booking requests
			this.prisma.carBooking.count({
				where: {
					car: { driver_id: driver.id },
					status: 'PENDING_DRIVER_ACCEPTANCE',
				},
			}),
			// Confirmed bookings
			this.prisma.carBooking.count({
				where: {
					car: { driver_id: driver.id },
					status: { in: ['ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'] },
				},
			}),
			// Total earnings
			this.prisma.carBooking.aggregate({
				where: {
					car: { driver_id: driver.id },
					status: 'COMPLETED',
				},
				_sum: { driver_earnings: true },
			}),
			// Total cars count
			this.prisma.car.count({
				where: { driver_id: driver.id },
			}),
			// Active cars count
			this.prisma.car.count({
				where: { driver_id: driver.id, is_active: true },
			}),
			// Recent bookings (last 5)
			this.prisma.carBooking.findMany({
				where: { car: { driver_id: driver.id } },
				include: {
					user: { select: { id: true, full_name: true } },
					car: { include: { carModel: true } },
				},
				orderBy: { created_at: 'desc' },
				take: 5,
			}),
		]);

		const totalEarnings = parseFloat(earningsResult._sum.driver_earnings?.toString() || '0');

		return {
			verification_status: {
				is_verified: driver.is_verified,
				verified_at: driver.verified_at?.toISOString() || null,
			},
			stats: {
				incoming_requests: incomingRequests,
				confirmed_bookings: confirmedBookings,
				total_earnings: totalEarnings,
				car_listings_count: carsCount,
				active_cars_count: activeCarsCount,
			},
			recent_bookings: recentBookings.map((booking) => ({
				id: booking.id,
				status: booking.status,
				customer: {
					name: booking.user.full_name,
				},
				car: {
					make: booking.car.carModel.make,
					model: booking.car.carModel.model,
				},
				start_date: booking.start_date.toISOString().split('T')[0],
				end_date: booking.end_date.toISOString().split('T')[0],
				driver_earnings: parseFloat(booking.driver_earnings.toString()),
				created_at: booking.created_at.toISOString(),
			})),
		};
	}

	/**
	 * Get driver earnings summary
	 */
	async getDriverEarnings(userId: number, dateFrom?: Date, dateTo?: Date) {
		const driver = await this.prisma.driver.findFirst({
			where: { user_id: userId },
		});

		if (!driver) {
			throw new NotFoundException('Driver profile not found');
		}

		const where: any = {
			car: {
				driver_id: driver.id,
			},
			status: 'COMPLETED',
		};

		if (dateFrom) {
			where.completed_at = { gte: dateFrom };
		}
		if (dateTo) {
			where.completed_at = {
				...where.completed_at,
				lte: dateTo,
			};
		}

		const earningsResult = await this.prisma.carBooking.aggregate({
			where,
			_sum: {
				driver_earnings: true,
			},
			_count: true,
		});

		const bookings = await this.prisma.carBooking.findMany({
			where,
			include: {
				car: {
					include: {
						carModel: true,
					},
				},
				user: {
					select: {
						full_name: true,
					},
				},
			},
			orderBy: { completed_at: 'desc' },
		});

		return {
			total_earnings: parseFloat(earningsResult._sum.driver_earnings?.toString() || '0'),
			total_completed_bookings: earningsResult._count,
			currency: 'PKR',
			bookings: bookings.map((booking) => ({
				id: booking.id,
				customer_name: booking.user.full_name,
				car: `${booking.car.carModel.make} ${booking.car.carModel.model}`,
				driver_earnings: parseFloat(booking.driver_earnings.toString()),
				completed_at: booking.completed_at?.toISOString() || null,
			})),
		};
	}

	/**
	 * Get earnings breakdown by month and by car
	 */
	async getEarningsBreakdown(userId: number) {
		const driver = await this.prisma.driver.findFirst({
			where: { user_id: userId },
		});

		if (!driver) {
			throw new NotFoundException('Driver profile not found');
		}

		// Get all completed bookings
		const bookings = await this.prisma.carBooking.findMany({
			where: {
				car: {
					driver_id: driver.id,
				},
				status: 'COMPLETED',
				completed_at: { not: null },
			},
			include: {
				car: {
					include: {
						carModel: true,
					},
				},
			},
		});

		// Group by month
		const byMonth: Record<string, number> = {};
		bookings.forEach((booking) => {
			if (booking.completed_at) {
				const month = booking.completed_at.toISOString().substring(0, 7); // YYYY-MM
				byMonth[month] = (byMonth[month] || 0) + parseFloat(booking.driver_earnings.toString());
			}
		});

		// Group by car
		const byCar: Record<number, { car: string; earnings: number; bookings: number }> = {};
		bookings.forEach((booking) => {
			const carId = booking.car_id;
			const carName = `${booking.car.carModel.make} ${booking.car.carModel.model}`;
			if (!byCar[carId]) {
				byCar[carId] = {
					car: carName,
					earnings: 0,
					bookings: 0,
				};
			}
			byCar[carId].earnings += parseFloat(booking.driver_earnings.toString());
			byCar[carId].bookings += 1;
		});

		return {
			by_month: Object.entries(byMonth).map(([month, earnings]) => ({
				month,
				earnings,
			})),
			by_car: Object.values(byCar),
		};
	}

	/**
	 * Get driver suspension status
	 */
	async getSuspensionStatus(userId: number) {
		const driver = await this.prisma.driver.findFirst({
			where: { user_id: userId },
			include: {
				user: true,
				currentSuspension: true,
				disciplinary_actions: {
					where: {
						period_end: { gte: new Date() },
					},
					orderBy: { created_at: 'desc' },
					take: 1,
				},
			},
		});

		if (!driver) {
			throw new NotFoundException('Driver profile not found');
		}

		const isSuspended = driver.user.status === 'inactive';
		const isBanned = driver.user.status === 'banned';
		const currentAction = driver.currentSuspension || driver.disciplinary_actions[0];

		// Count disputes in current period
		const periodStart = currentAction
			? new Date(currentAction.period_start)
			: new Date(new Date().setMonth(new Date().getMonth() - 3));

		const disputeCount = await this.prisma.dispute.count({
			where: {
				bookingCar: {
					car: { driver_id: driver.id },
				},
				created_at: { gte: periodStart },
			},
		});

		return {
			is_suspended: isSuspended,
			is_banned: isBanned,
			is_paused: currentAction?.is_paused || false,
			suspension_type: currentAction?.action_type,
			dispute_count: disputeCount,
			suspension_end_date: currentAction?.scheduled_end?.toISOString(),
			pause_reason: currentAction?.pause_reason,
			warning_sent: !!driver.last_warning_at,
		};
	}
}




