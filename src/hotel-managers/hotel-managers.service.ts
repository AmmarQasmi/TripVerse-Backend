import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { NotificationsService as CommonNotificationsService } from '../common/services/notifications.service';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { VerifyHotelManagerDto } from './dto/verify-manager.dto';
import { DocumentType } from '@prisma/client';

@Injectable()
export class HotelManagersService {
	constructor(
		private prisma: PrismaService,
		private cloudinaryService: CloudinaryService,
		private notificationsService: CommonNotificationsService,
	) {}

	// Hotel manager submits verification documents
	async submitVerification(userId: number, dto: SubmitVerificationDto) {
		// Check if hotel manager exists
		const hotelManager = await this.prisma.hotelManager.findFirst({
			where: { user_id: userId },
			include: {
				user: {
					select: {
						id: true,
						full_name: true,
						email: true,
					},
				},
			},
		});

		if (!hotelManager) {
			throw new NotFoundException('Hotel manager profile not found');
		}

		// Validate required documents
		const requiredTypes: DocumentType[] = ['hotel_registration', 'business_license'];
		const providedTypes = dto.documents.map(doc => doc.document_type);
		
		for (const requiredType of requiredTypes) {
			if (!providedTypes.includes(requiredType)) {
				throw new BadRequestException(`Required document type missing: ${requiredType}`);
			}
		}

		// Check if manager already has pending documents
		const existingPendingDocs = await this.prisma.hotelManagerDocument.findMany({
			where: {
				hotel_manager_id: hotelManager.id,
				status: 'pending',
			},
		});

		// Check if manager was previously rejected (has verification_notes)
		const wasRejected = hotelManager.verification_notes && !hotelManager.is_verified;
		
		// Check if all required documents are pending (re-uploaded after rejection)
		const allRequiredDocs = await this.prisma.hotelManagerDocument.findMany({
			where: {
				hotel_manager_id: hotelManager.id,
				document_type: { in: requiredTypes },
			},
		});
		const allRequiredPending = allRequiredDocs.length === requiredTypes.length && 
			allRequiredDocs.every(doc => doc.status === 'pending');
		
		// Allow re-submission if:
		// 1. Manager was previously rejected AND
		// 2. All required documents are now pending (re-uploaded)
		// Otherwise, block if there are any pending documents
		if (existingPendingDocs.length > 0 && !(wasRejected && allRequiredPending)) {
			throw new BadRequestException('You already have pending documents under review. Please wait for admin approval or rejection before submitting new documents.');
		}

		// Check if manager is already verified - if so, they can only update rejected documents
		if (hotelManager.is_verified) {
			throw new BadRequestException('You are already verified. If you need to update documents, please contact admin.');
		}

		// If manager was previously rejected and is now re-submitting, clear verification_notes
		// This indicates a fresh submission after addressing rejection
		if (wasRejected && allRequiredPending) {
			await this.prisma.hotelManager.update({
				where: { id: hotelManager.id },
				data: {
					verification_notes: null,
				},
			});
		}

		// Update or create documents
		// If documents are already pending (from uploadDocument), just verify they exist
		// If documents were rejected, update them to pending
		// If documents don't exist, create them
		for (const doc of dto.documents) {
			// Check if document already exists
			const existingDoc = await this.prisma.hotelManagerDocument.findFirst({
				where: {
					hotel_manager_id: hotelManager.id,
					document_type: doc.document_type,
				},
			});

			if (existingDoc) {
				// If document is already pending, it means it was uploaded via uploadDocument
				// Just verify the URL matches (or update if different)
				if (existingDoc.status === 'pending') {
					// Document already uploaded and pending - just update URL if different
					if (existingDoc.document_url !== doc.document_url) {
						await this.prisma.hotelManagerDocument.update({
							where: { id: existingDoc.id },
							data: {
								document_url: doc.document_url,
								uploaded_at: new Date(),
							},
						});
					}
					// Document is already pending, no need to do anything else
				} else if (existingDoc.status === 'rejected') {
					// Update rejected document to pending
					await this.prisma.hotelManagerDocument.update({
						where: { id: existingDoc.id },
						data: {
							document_url: doc.document_url,
							status: 'pending',
							uploaded_at: new Date(),
							rejection_reason: null,
							reviewed_at: null,
							reviewed_by: null,
						},
					});
				} else if (existingDoc.status === 'approved') {
					// Document is already approved - don't allow changes
					throw new BadRequestException(`Document type ${doc.document_type} is already approved. Please contact admin if you need to update it.`);
				}
			} else {
				// Create new document
				await this.prisma.hotelManagerDocument.create({
					data: {
						hotel_manager_id: hotelManager.id,
						document_type: doc.document_type,
						document_url: doc.document_url,
						status: 'pending',
					},
				});
			}
		}

		// Notify all admins about the verification submission
		await this.notificationsService.notifyAdminsOfVerificationSubmission(
			'hotel_manager',
			hotelManager.user.full_name,
			hotelManager.user.email,
		);

		return {
			message: 'Verification documents submitted successfully. Please wait for admin approval.',
			hotel_manager_id: hotelManager.id,
		};
	}

	// Admin: Verify or reject hotel manager
	async verifyHotelManager(managerId: number, dto: VerifyHotelManagerDto) {
		const hotelManager = await this.prisma.hotelManager.findUnique({
			where: { id: managerId },
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

		if (!hotelManager) {
			throw new NotFoundException('Hotel manager not found');
		}

		const updatedManager = await this.prisma.hotelManager.update({
			where: { id: managerId },
			data: {
				is_verified: dto.is_verified,
				verification_notes: dto.verification_notes || null,
				verified_at: dto.is_verified ? new Date() : null,
			},
		});

		// Update all pending documents to approved if verified
		if (dto.is_verified) {
			await this.prisma.hotelManagerDocument.updateMany({
				where: {
					hotel_manager_id: managerId,
					status: 'pending',
				},
				data: {
					status: 'approved',
					reviewed_at: new Date(),
				},
			});
		}

		// Send notification
		if (dto.is_verified) {
			await this.notificationsService.notifyHotelManagerVerificationApproved(
				hotelManager.user.id,
				hotelManager.user.full_name,
			);
		} else {
			await this.notificationsService.notifyHotelManagerVerificationRejected(
				hotelManager.user.id,
				hotelManager.user.full_name,
				dto.verification_notes || 'Verification rejected',
			);
		}

		return {
			message: dto.is_verified ? 'Hotel manager verified successfully' : 'Hotel manager verification rejected',
			hotel_manager: updatedManager,
		};
	}

	// Get hotel manager profile with verification status
	async getHotelManagerProfile(userId: number) {
		const hotelManager = await this.prisma.hotelManager.findFirst({
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
				hotels: {
					include: {
						city: true,
						images: {
							orderBy: { display_order: 'asc' },
							take: 1,
						},
					},
				},
				documents: {
					orderBy: { uploaded_at: 'desc' },
				},
			},
		});

		if (!hotelManager) {
			throw new NotFoundException('Hotel manager profile not found');
		}

		return hotelManager;
	}

	/**
	 * Upload hotel manager document to Cloudinary
	 */
	async uploadDocument(userId: number, file: any, documentType: string) {
		const hotelManager = await this.prisma.hotelManager.findFirst({
			where: { user_id: userId },
		});

		if (!hotelManager) {
			throw new NotFoundException('Hotel manager profile not found');
		}

		const validTypes = ['hotel_registration', 'business_license', 'tax_certificate'];
		if (!validTypes.includes(documentType)) {
			throw new BadRequestException(`Invalid document type. Valid types: ${validTypes.join(', ')}`);
		}

		try {
			// Upload to Cloudinary
			const uploadResult = await this.cloudinaryService.uploadDocument(
				file,
				'hotel-manager-documents',
				{},
			) as any;

			// Check if document already exists
			const existingDoc = await this.prisma.hotelManagerDocument.findFirst({
				where: {
					hotel_manager_id: hotelManager.id,
					document_type: documentType as DocumentType,
				},
			});

		if (existingDoc) {
			// Only allow replacement if:
			// 1. Document is rejected, OR
			// 2. Manager is not verified AND document is not approved (can replace pending docs before submission)
			if (existingDoc.status === 'approved') {
				throw new BadRequestException('Cannot replace an approved document. Please contact admin if you need to update it.');
			}

			// If document is pending and manager is verified, don't allow replacement (under review)
			if (existingDoc.status === 'pending' && hotelManager.is_verified) {
				throw new BadRequestException('Cannot replace a pending document that is under review.');
			}

			// Check if there are other pending documents (verification already submitted)
			const otherPendingDocs = await this.prisma.hotelManagerDocument.findFirst({
				where: {
					hotel_manager_id: hotelManager.id,
					status: 'pending',
					id: { not: existingDoc.id },
				},
			});

			// If there are other pending docs, verification has been submitted, so don't allow replacing
			if (existingDoc.status === 'pending' && otherPendingDocs) {
				throw new BadRequestException('Cannot replace a pending document. Verification has already been submitted and is under review.');
			}

			// Update existing document (rejected or pending before verification submission)
			if (existingDoc.public_id) {
				await this.cloudinaryService.deleteImage(existingDoc.public_id);
			}
			const updated = await this.prisma.hotelManagerDocument.update({
				where: { id: existingDoc.id },
				data: {
					document_url: uploadResult.secure_url,
					public_id: uploadResult.public_id,
					status: 'pending',
					uploaded_at: new Date(),
					// Clear review fields if replacing
					rejection_reason: null,
					reviewed_at: null,
					reviewed_by: null,
				},
			});
			return updated;
			} else {
				// Create new document
				const created = await this.prisma.hotelManagerDocument.create({
					data: {
						hotel_manager_id: hotelManager.id,
						document_type: documentType as DocumentType,
						document_url: uploadResult.secure_url,
						public_id: uploadResult.public_id,
						status: 'pending',
					},
				});
				return created;
			}
		} catch (error) {
			if (error instanceof BadRequestException) {
				throw error;
			}
			throw new BadRequestException('Failed to upload document');
		}
	}

	/**
	 * Delete hotel manager document from Cloudinary and database
	 */
	async deleteDocument(userId: number, documentId: number) {
		const hotelManager = await this.prisma.hotelManager.findFirst({
			where: { user_id: userId },
		});

		if (!hotelManager) {
			throw new NotFoundException('Hotel manager profile not found');
		}

		const document = await this.prisma.hotelManagerDocument.findFirst({
			where: {
				id: documentId,
				hotel_manager_id: hotelManager.id,
			},
		});

		if (!document) {
			throw new NotFoundException('Document not found');
		}

		try {
			// Delete from Cloudinary if public_id exists
			if (document.public_id) {
				await this.cloudinaryService.deleteImage(document.public_id);
			}

			// Delete from database
			await this.prisma.hotelManagerDocument.delete({
				where: { id: documentId },
			});

			return { message: 'Document deleted successfully' };
		} catch (error) {
			throw new BadRequestException('Failed to delete document');
		}
	}

	/**
	 * Get hotel manager dashboard summary
	 */
	async getHotelManagerDashboard(userId: number) {
		const hotelManager = await this.prisma.hotelManager.findFirst({
			where: { user_id: userId },
			include: {
				documents: {
					select: {
						status: true,
					},
				},
			},
		});

		if (!hotelManager) {
			throw new NotFoundException('Hotel manager profile not found');
		}

		// Get all hotels for this manager
		const hotels = await this.prisma.hotel.findMany({
			where: { manager_id: hotelManager.id },
			select: { id: true },
		});
		const hotelIds = hotels.map(h => h.id);

		// Run queries in parallel
		const [
			totalHotels,
			activeHotels,
			totalBookings,
			confirmedBookings,
			earningsResult,
			roomsAvailable,
			roomsBooked,
			recentBookings,
		] = await Promise.all([
			// Total hotels
			this.prisma.hotel.count({
				where: { manager_id: hotelManager.id },
			}),
			// Active hotels
			this.prisma.hotel.count({
				where: { manager_id: hotelManager.id, is_active: true, is_listed: true },
			}),
			// Total bookings
			this.prisma.hotelBooking.count({
				where: { hotel_id: { in: hotelIds } },
			}),
			// Confirmed bookings
			this.prisma.hotelBooking.count({
				where: {
					hotel_id: { in: hotelIds },
					status: { in: ['CONFIRMED', 'CHECKED_IN'] },
				},
			}),
			// Total earnings (from confirmed/completed bookings)
			this.prisma.hotelBooking.aggregate({
				where: {
					hotel_id: { in: hotelIds },
					status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
				},
				_sum: { total_amount: true },
			}),
			// Calculate available rooms (total - booked)
			this.calculateAvailableRooms(hotelIds),
			// Calculate booked rooms
			this.calculateBookedRooms(hotelIds),
			// Recent bookings (last 5)
			this.prisma.hotelBooking.findMany({
				where: { hotel_id: { in: hotelIds } },
				include: {
					user: { select: { id: true, full_name: true } },
					hotel: { select: { id: true, name: true } },
					room_type: { select: { id: true, name: true } },
				},
				orderBy: { created_at: 'desc' },
				take: 5,
			}),
		]);

		const totalEarnings = parseFloat(earningsResult._sum.total_amount?.toString() || '0');
		// Platform commission is 5%, manager gets 95%
		const managerEarnings = totalEarnings * 0.95;

		return {
			verification_status: {
				is_verified: hotelManager.is_verified,
				verified_at: hotelManager.verified_at?.toISOString() || null,
				has_rejected_documents: hotelManager.documents.some(d => d.status === 'rejected'),
			},
			stats: {
				total_hotels: totalHotels,
				active_hotels: activeHotels,
				total_bookings: totalBookings,
				confirmed_bookings: confirmedBookings,
				total_earnings: managerEarnings,
				rooms_available: roomsAvailable,
				rooms_booked: roomsBooked,
			},
			recent_bookings: recentBookings.map((booking) => ({
				id: booking.id,
				status: booking.status,
				customer: {
					name: booking.user.full_name,
				},
				hotel: {
					name: booking.hotel.name,
				},
				room_type: booking.room_type.name,
				check_in: booking.check_in.toISOString().split('T')[0],
				check_out: booking.check_out.toISOString().split('T')[0],
				total_amount: parseFloat(booking.total_amount.toString()),
				created_at: booking.created_at.toISOString(),
			})),
		};
	}

	/**
	 * Get hotel manager earnings summary
	 */
	async getHotelManagerEarnings(userId: number, dateFrom?: Date, dateTo?: Date) {
		const hotelManager = await this.prisma.hotelManager.findFirst({
			where: { user_id: userId },
		});

		if (!hotelManager) {
			throw new NotFoundException('Hotel manager profile not found');
		}

		const hotels = await this.prisma.hotel.findMany({
			where: { manager_id: hotelManager.id },
			select: { id: true },
		});
		const hotelIds = hotels.map(h => h.id);

		const where: any = {
			hotel_id: { in: hotelIds },
			status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
		};

		if (dateFrom) {
			where.created_at = { gte: dateFrom };
		}
		if (dateTo) {
			where.created_at = {
				...where.created_at,
				lte: dateTo,
			};
		}

		const earningsResult = await this.prisma.hotelBooking.aggregate({
			where,
			_sum: {
				total_amount: true,
			},
			_count: true,
		});

		const bookings = await this.prisma.hotelBooking.findMany({
			where,
			include: {
				hotel: {
					select: {
						id: true,
						name: true,
					},
				},
				room_type: {
					select: {
						id: true,
						name: true,
					},
				},
				user: {
					select: {
						full_name: true,
					},
				},
			},
			orderBy: { created_at: 'desc' },
		});

		const totalEarnings = parseFloat(earningsResult._sum.total_amount?.toString() || '0');
		const managerEarnings = totalEarnings * 0.95; // 95% to manager

		return {
			total_earnings: managerEarnings,
			total_bookings: earningsResult._count,
			currency: 'PKR',
			bookings: bookings.map((booking) => ({
				id: booking.id,
				customer_name: booking.user.full_name,
				hotel: booking.hotel.name,
				room_type: booking.room_type.name,
				total_amount: parseFloat(booking.total_amount.toString()),
				manager_earnings: parseFloat(booking.total_amount.toString()) * 0.95,
				created_at: booking.created_at.toISOString(),
			})),
		};
	}

	/**
	 * Get earnings breakdown by period and by hotel
	 */
	async getEarningsBreakdown(userId: number) {
		const hotelManager = await this.prisma.hotelManager.findFirst({
			where: { user_id: userId },
		});

		if (!hotelManager) {
			throw new NotFoundException('Hotel manager profile not found');
		}

		const hotels = await this.prisma.hotel.findMany({
			where: { manager_id: hotelManager.id },
			select: { id: true, name: true },
		});
		const hotelIds = hotels.map(h => h.id);

		// Get all confirmed/completed bookings
		const bookings = await this.prisma.hotelBooking.findMany({
			where: {
				hotel_id: { in: hotelIds },
				status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
			},
			include: {
				hotel: {
					select: {
						id: true,
						name: true,
					},
				},
			},
		});

		// Group by month
		const byMonth: Record<string, number> = {};
		// Group by hotel
		const byHotel: Record<string, number> = {};

		for (const booking of bookings) {
			const month = booking.created_at.toISOString().substring(0, 7); // YYYY-MM
			const amount = parseFloat(booking.total_amount.toString()) * 0.95; // Manager gets 95%
			
			byMonth[month] = (byMonth[month] || 0) + amount;
			
			const hotelName = booking.hotel.name;
			byHotel[hotelName] = (byHotel[hotelName] || 0) + amount;
		}

		return {
			by_month: Object.entries(byMonth).map(([month, earnings]) => ({
				month,
				earnings,
			})),
			by_hotel: Object.entries(byHotel).map(([hotel, earnings]) => ({
				hotel,
				earnings,
			})),
		};
	}

	// Helper methods
	private async calculateAvailableRooms(hotelIds: number[]): Promise<number> {
		if (hotelIds.length === 0) return 0;

		// Get total rooms for all hotels
		const roomTypes = await this.prisma.hotelRoomType.findMany({
			where: {
				hotel_id: { in: hotelIds },
				is_active: true,
			},
			select: {
				id: true,
				total_rooms: true,
			},
		});

		const totalRooms = roomTypes.reduce((sum, rt) => sum + rt.total_rooms, 0);

		// Get booked rooms (confirmed bookings for current/future dates)
		const now = new Date();
		now.setHours(0, 0, 0, 0);

		const bookedBookings = await this.prisma.hotelBooking.findMany({
			where: {
				hotel_id: { in: hotelIds },
				room_type_id: { in: roomTypes.map(rt => rt.id) },
				status: 'CONFIRMED',
				check_out: { gte: now },
			},
			select: {
				quantity: true,
			},
		});

		const bookedRooms = bookedBookings.reduce((sum, b) => sum + b.quantity, 0);

		return Math.max(0, totalRooms - bookedRooms);
	}

	private async calculateBookedRooms(hotelIds: number[]): Promise<number> {
		if (hotelIds.length === 0) return 0;

		const now = new Date();
		now.setHours(0, 0, 0, 0);

		const bookedBookings = await this.prisma.hotelBooking.findMany({
			where: {
				hotel_id: { in: hotelIds },
				status: { in: ['CONFIRMED', 'CHECKED_IN'] },
				check_out: { gte: now },
			},
			select: {
				quantity: true,
			},
		});

		return bookedBookings.reduce((sum, b) => sum + b.quantity, 0);
	}
}

