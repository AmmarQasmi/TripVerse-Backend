import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject } from '@nestjs/common';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService as CommonNotificationsService } from '../common/services/notifications.service';

@Injectable()
export class HotelsService {
	constructor(
		@Inject(PrismaService) private prisma: PrismaService,
		private cloudinaryService: CloudinaryService,
		private notificationsService: CommonNotificationsService,
	) {}

	/**
	 * Search and filter hotels
	 * Supports: city, price range, amenities, star rating, pagination
	 */
	async findAll(query: any = {}) {
		// Parse query parameters
		const city_id = query.city_id ? parseInt(query.city_id) : null;
		const minPrice = query.minPrice ? parseFloat(query.minPrice) : 0;
		const maxPrice = query.maxPrice ? parseFloat(query.maxPrice) : 999999;
		const page = query.page ? parseInt(query.page) : 1;
		const limit = query.limit ? parseInt(query.limit) : 20;

		// Parse amenities (string -> array)
		const amenities = query.amenities
			? typeof query.amenities === 'string'
				? query.amenities.split(',').map((a: string) => a.trim())
				: Array.isArray(query.amenities)
				? query.amenities
				: []
			: [];

		// Parse star ratings (string -> array of numbers)
		const starRating = query.starRating
			? typeof query.starRating === 'string'
				? query.starRating.split(',').map((s: string) => parseInt(s.trim()))
				: Array.isArray(query.starRating)
				? query.starRating.map(Number)
				: []
			: [];

		// Build WHERE conditions
		// For customer-facing queries, filter by verified manager and listed hotels
		const where: any = { 
			is_active: true,
			is_listed: true,
			manager: {
				is_verified: true,
			},
		};

		if (city_id) {
			where.city_id = city_id;
		}

		if (starRating.length > 0) {
			where.star_rating = { in: starRating };
		}

		// Fetch hotels with relations
		const [hotels, total] = await Promise.all([
			this.prisma.hotel.findMany({
				where,
				include: {
					city: { select: { id: true, name: true, region: true } },
					manager: {
						select: {
							id: true,
							is_verified: true,
						},
					},
					images: {
						orderBy: { display_order: 'asc' },
						take: 1, // Primary image only
					},
					roomTypes: {
						where: { is_active: true },
						orderBy: { base_price: 'asc' },
					},
				},
				orderBy: [
					{ star_rating: 'desc' },
					{ created_at: 'desc' },
				],
				skip: (page - 1) * limit,
				take: limit,
			}),
			this.prisma.hotel.count({ where }),
		]);

		// Filter by price (from room types)
		const filteredHotels = hotels.filter((hotel) => {
			if (hotel.roomTypes.length === 0) return false;
			const minRoomPrice = Math.min(
				...hotel.roomTypes.map((r) => parseFloat(r.base_price.toString())),
			);
			return minRoomPrice >= minPrice && minRoomPrice <= maxPrice;
		});

		// Filter by amenities
		const finalHotels =
			amenities.length > 0
				? filteredHotels.filter((hotel) => {
						const hotelAmenities = (hotel.amenities as string[]) || [];
						return amenities.every((a: string) => hotelAmenities.includes(a));
				  })
				: filteredHotels;

		// Transform response
		const formatted = finalHotels.map((hotel) => ({
			id: hotel.id.toString(),
			name: hotel.name,
			description: hotel.description,
			location: hotel.city.name,
			address: hotel.address,
			rating: hotel.star_rating,
			pricePerNight: hotel.roomTypes[0]
				? parseFloat(hotel.roomTypes[0].base_price.toString())
				: null,
			images: hotel.images.map((img) => img.image_url),
			amenities: (hotel.amenities as string[]) || [],
			roomTypes: hotel.roomTypes.map((rt) => ({
				id: rt.id.toString(),
				name: rt.name,
				pricePerNight: parseFloat(rt.base_price.toString()),
				capacity: rt.max_occupancy,
			})),
			createdAt: hotel.created_at.toISOString(),
			updatedAt: hotel.updated_at.toISOString(),
		}));

		return {
			data: formatted,
			pagination: {
				page,
				limit,
				total: finalHotels.length,
				totalPages: Math.ceil(finalHotels.length / limit),
			},
		};
	}

	/**
	 * Get single hotel with complete details
	 */
	async findOne(id: number, isAdmin: boolean = false, managerId?: number) {
		const hotel = await this.prisma.hotel.findUnique({
			where: { id },
			include: {
				city: { select: { id: true, name: true, region: true } },
				manager: {
					select: {
						id: true,
						is_verified: true,
					},
				},
				images: { orderBy: { display_order: 'asc' } },
				roomTypes: {
					where: { is_active: true },
					orderBy: { base_price: 'asc' },
				},
			},
		});

		if (!hotel) {
			throw new NotFoundException('Hotel not found');
		}

		// For non-admin queries, check active status, manager verification and listing status
		if (!isAdmin) {
			// Check if this is the hotel manager's own hotel
			const isHotelManager = managerId !== undefined && hotel.manager_id === managerId;
			
			if (!isHotelManager) {
				// For customers and managers viewing other hotels: hotel must be active, listed, and manager must be verified
				if (!hotel.is_active || !hotel.manager || !hotel.manager.is_verified || !hotel.is_listed) {
					throw new NotFoundException('Hotel not found');
				}
			} else {
				// Hotel managers can view their own hotels even if inactive, but manager must be verified
				if (!hotel.manager || !hotel.manager.is_verified) {
					throw new NotFoundException('Hotel not found');
				}
			}
		}

		return {
			id: hotel.id.toString(),
			name: hotel.name,
			description: hotel.description,
			location: hotel.city.name,
			address: hotel.address,
			rating: hotel.star_rating,
			images: hotel.images.map((img) => img.image_url),
			amenities: (hotel.amenities as string[]) || [],
			roomTypes: hotel.roomTypes.map((room) => ({
				id: room.id.toString(),
				hotelId: hotel.id.toString(),
				name: room.name,
				description: room.description,
				capacity: room.max_occupancy,
				pricePerNight: parseFloat(room.base_price.toString()),
				amenities: (room.amenities as string[]) || [],
				images: (room.images as string[]) || [],
			})),
			createdAt: hotel.created_at.toISOString(),
			updatedAt: hotel.updated_at.toISOString(),
		};
	}

	/**
	 * Create new hotel (Hotel Manager only, must be verified)
	 */
	async create(data: any, managerId?: number) {
		// Validate city exists
		const city = await this.prisma.city.findUnique({
			where: { id: data.city_id },
		});

		if (!city) {
			throw new NotFoundException('City not found');
		}

		// If managerId is provided, verify the manager is verified
		if (managerId) {
			const hotelManager = await this.prisma.hotelManager.findUnique({
				where: { id: managerId },
			});

			if (!hotelManager) {
				throw new NotFoundException('Hotel manager not found');
			}

			if (!hotelManager.is_verified) {
				throw new ForbiddenException('Hotel manager must be verified before creating hotels');
			}
		}

		// Validate room type names if provided
		const validRoomTypes = ['SINGLE', 'DOUBLE', 'DELUXE', 'SUITE'];
		if (data.roomTypes?.length > 0) {
			for (const room of data.roomTypes) {
				if (!validRoomTypes.includes(room.name)) {
					throw new Error(
						`Invalid room type "${room.name}". Valid types: ${validRoomTypes.join(', ')}`,
					);
				}
			}
		}

		// Create hotel with images and rooms in transaction
		const hotel = await this.prisma.$transaction(async (tx) => {
			const newHotel = await tx.hotel.create({
				data: {
					name: data.name,
					city_id: data.city_id,
					manager_id: managerId || null,
					description: data.description,
					address: data.address,
					star_rating: data.star_rating || 4,
					amenities: data.amenities || [],
					is_active: false, // Hotels need admin approval before becoming active
					is_listed: true, // Hotels are listed by default, but only active ones are visible to customers
				},
			});

			// Create images if provided
			if (data.images?.length > 0) {
				await tx.hotelImage.createMany({
					data: data.images.map((url: string, index: number) => ({
						hotel_id: newHotel.id,
						image_url: url,
						display_order: index,
					})),
				});
			}

			// Create room types if provided
			if (data.roomTypes?.length > 0) {
				for (const room of data.roomTypes) {
					await tx.hotelRoomType.create({
						data: {
							hotel_id: newHotel.id,
							name: room.name,
							description: room.description,
							max_occupancy: room.max_occupancy,
							base_price: room.base_price,
							total_rooms: room.total_rooms,
							amenities: room.amenities || [],
							images: room.images || [],
							is_active: true,
						},
					});
				}
			}

			return newHotel;
		});

		// Notify all admins about new hotel listing
		try {
			const admins = await this.prisma.user.findMany({
				where: {
					role: 'admin',
					status: 'active',
				},
				select: {
					id: true,
				},
			});

			const manager = managerId ? await this.prisma.hotelManager.findUnique({
				where: { id: managerId },
				include: { user: { select: { full_name: true } } },
			}) : null;

			const managerName = manager?.user?.full_name || 'Hotel Manager';

			for (const admin of admins) {
				await this.notificationsService.createNotification(
					admin.id,
					'hotel_listing_created',
					'New Hotel Listing Created',
					`${managerName} has created a new hotel listing: ${hotel.name}. Review and activate it.`,
					{
						hotel_id: hotel.id,
						manager_id: managerId,
					},
				);
			}
		} catch (error) {
			// Don't fail hotel creation if notification fails
			console.error('Failed to notify admins about hotel listing:', error);
		}

		return {
			id: hotel.id,
			name: hotel.name,
			message: 'Hotel created successfully',
		};
	}

	/**
	 * Update hotel (Admin or Hotel Manager - must own the hotel)
	 */
	async update(id: number, data: any, managerId?: number, isAdmin: boolean = false) {
		const hotel = await this.prisma.hotel.findUnique({ 
			where: { id },
			include: {
				manager: {
					select: {
						id: true,
					},
				},
			},
		});

		if (!hotel) {
			throw new NotFoundException('Hotel not found');
		}

		// Check ownership: manager can only update their own hotels, admin can update any
		if (!isAdmin && managerId) {
			if (hotel.manager_id !== managerId) {
				throw new ForbiddenException('You can only update your own hotels');
			}
		}

		const updateData: any = {
			name: data.name,
			description: data.description,
			address: data.address,
			star_rating: data.star_rating,
			amenities: data.amenities,
		};

		// Allow admin to activate/deactivate hotels
		if (isAdmin && data.is_active !== undefined) {
			updateData.is_active = data.is_active;
		}

		const updated = await this.prisma.hotel.update({
			where: { id },
			data: updateData,
		});

		return {
			id: updated.id,
			name: updated.name,
			message: 'Hotel updated successfully',
		};
	}

	/**
	 * Soft delete hotel (Admin or Hotel Manager - must own the hotel)
	 */
	async remove(id: number, managerId?: number, isAdmin: boolean = false) {
		const hotel = await this.prisma.hotel.findUnique({ 
			where: { id },
			include: {
				manager: {
					select: {
						id: true,
					},
				},
			},
		});

		if (!hotel) {
			throw new NotFoundException('Hotel not found');
		}

		// Check ownership: manager can only delete their own hotels, admin can delete any
		if (!isAdmin && managerId) {
			if (hotel.manager_id !== managerId) {
				throw new ForbiddenException('You can only delete your own hotels');
			}
		}

		await this.prisma.hotel.update({
			where: { id },
			data: { is_active: false },
		});

		return { message: 'Hotel deactivated successfully' };
	}

	/**
	 * Add room type to hotel (Admin or Hotel Manager - must own the hotel)
	 */
	async addRoomType(hotelId: number, data: any, managerId?: number, isAdmin: boolean = false) {
		const hotel = await this.prisma.hotel.findUnique({ 
			where: { id: hotelId },
			include: {
				manager: {
					select: {
						id: true,
					},
				},
			},
		});

		if (!hotel || !hotel.is_active) {
			throw new NotFoundException('Hotel not found');
		}

		// Check ownership
		if (!isAdmin && managerId) {
			if (hotel.manager_id !== managerId) {
				throw new ForbiddenException('You can only add room types to your own hotels');
			}
		}

		// Validate room type name
		const validRoomTypes = ['SINGLE', 'DOUBLE', 'DELUXE', 'SUITE'];
		if (!validRoomTypes.includes(data.name)) {
			throw new Error(
				`Invalid room type "${data.name}". Valid types: ${validRoomTypes.join(', ')}`,
			);
		}

		const roomType = await this.prisma.hotelRoomType.create({
			data: {
				hotel_id: hotelId,
				name: data.name,
				description: data.description,
				max_occupancy: data.max_occupancy,
				base_price: data.base_price,
				total_rooms: data.total_rooms,
				amenities: data.amenities || [],
				images: data.images || [],
				is_active: true,
			},
		});

		return {
			id: roomType.id,
			name: roomType.name,
			message: 'Room type added successfully',
		};
	}

	/**
	 * Update room type (Admin or Hotel Manager - must own the hotel)
	 */
	async updateRoomType(hotelId: number, roomId: number, data: any, managerId?: number, isAdmin: boolean = false) {
		const roomType = await this.prisma.hotelRoomType.findFirst({
			where: { id: roomId, hotel_id: hotelId },
			include: {
				hotel: {
					include: {
						manager: {
							select: {
								id: true,
							},
						},
					},
				},
			},
		});

		if (!roomType) {
			throw new NotFoundException('Room type not found');
		}

		// Check ownership
		if (!isAdmin && managerId) {
			if (roomType.hotel.manager_id !== managerId) {
				throw new ForbiddenException('You can only update room types for your own hotels');
			}
		}

		// Validate room type name if being updated
		if (data.name) {
			const validRoomTypes = ['SINGLE', 'DOUBLE', 'DELUXE', 'SUITE'];
			if (!validRoomTypes.includes(data.name)) {
				throw new Error(
					`Invalid room type "${data.name}". Valid types: ${validRoomTypes.join(', ')}`,
				);
			}
		}

		const updated = await this.prisma.hotelRoomType.update({
			where: { id: roomId },
			data: {
				name: data.name,
				description: data.description,
				max_occupancy: data.max_occupancy,
				base_price: data.base_price,
				total_rooms: data.total_rooms,
				amenities: data.amenities,
				images: data.images,
			},
		});

		return {
			id: updated.id,
			message: 'Room type updated successfully',
		};
	}

	/**
	 * Delete room type (Admin or Hotel Manager - must own the hotel)
	 */
	async removeRoomType(hotelId: number, roomId: number, managerId?: number, isAdmin: boolean = false) {
		const roomType = await this.prisma.hotelRoomType.findFirst({
			where: { id: roomId, hotel_id: hotelId },
			include: {
				hotel: {
					include: {
						manager: {
							select: {
								id: true,
							},
						},
					},
				},
			},
		});

		if (!roomType) {
			throw new NotFoundException('Room type not found');
		}

		// Check ownership
		if (!isAdmin && managerId) {
			if (roomType.hotel.manager_id !== managerId) {
				throw new ForbiddenException('You can only delete room types from your own hotels');
			}
		}

		await this.prisma.hotelRoomType.update({
			where: { id: roomId },
			data: { is_active: false },
		});

		return { message: 'Room type deactivated successfully' };
	}

	/**
	 * Add images to hotel (Admin or Hotel Manager - must own the hotel)
	 */
	async addImages(hotelId: number, imageUrls: string[], managerId?: number, isAdmin: boolean = false) {
		const hotel = await this.prisma.hotel.findUnique({ 
			where: { id: hotelId },
			include: {
				manager: {
					select: {
						id: true,
					},
				},
			},
		});

		if (!hotel || !hotel.is_active) {
			throw new NotFoundException('Hotel not found');
		}

		// Check ownership
		if (!isAdmin && managerId) {
			if (hotel.manager_id !== managerId) {
				throw new ForbiddenException('You can only add images to your own hotels');
			}
		}

		// Get current max order
		const maxOrder = await this.prisma.hotelImage.findFirst({
			where: { hotel_id: hotelId },
			orderBy: { display_order: 'desc' },
		});

		const startOrder = (maxOrder?.display_order || -1) + 1;

		await this.prisma.hotelImage.createMany({
			data: imageUrls.map((url, index) => ({
				hotel_id: hotelId,
				image_url: url,
				display_order: startOrder + index,
			})),
		});

		return { message: `${imageUrls.length} image(s) added successfully` };
	}

	/**
	 * Delete hotel image (Admin or Hotel Manager - must own the hotel)
	 */
	async removeImage(hotelId: number, imageId: number, managerId?: number, isAdmin: boolean = false) {
		const image = await this.prisma.hotelImage.findFirst({
			where: { id: imageId, hotel_id: hotelId },
			include: {
				hotel: {
					include: {
						manager: {
							select: {
								id: true,
							},
						},
					},
				},
			},
		});

		if (!image) {
			throw new NotFoundException('Image not found');
		}

		// Check ownership
		if (!isAdmin && managerId) {
			if (image.hotel.manager_id !== managerId) {
				throw new ForbiddenException('You can only delete images from your own hotels');
			}
		}

		await this.prisma.hotelImage.delete({
			where: { id: imageId },
		});

		return { message: 'Image deleted successfully' };
	}

	/**
	 * Reorder hotel images (Admin or Hotel Manager - must own the hotel)
	 */
	async reorderImages(hotelId: number, imageIds: number[], managerId?: number, isAdmin: boolean = false) {
		const hotel = await this.prisma.hotel.findUnique({ 
			where: { id: hotelId },
			include: {
				manager: {
					select: {
						id: true,
					},
				},
			},
		});

		if (!hotel) {
			throw new NotFoundException('Hotel not found');
		}

		// Check ownership
		if (!isAdmin && managerId) {
			if (hotel.manager_id !== managerId) {
				throw new ForbiddenException('You can only reorder images for your own hotels');
			}
		}

		// Update display_order for each image
		await this.prisma.$transaction(
			imageIds.map((imageId, index) =>
				this.prisma.hotelImage.updateMany({
					where: { id: imageId, hotel_id: hotelId },
					data: { display_order: index },
				}),
			),
		);

		return { message: 'Images reordered successfully' };
	}

	/**
	 * Upload and add images to hotel using Cloudinary (Admin or Hotel Manager - must own the hotel)
	 */
	async uploadImages(hotelId: number, files: any[], managerId?: number, isAdmin: boolean = false) {
		const hotel = await this.prisma.hotel.findUnique({ 
			where: { id: hotelId },
			include: {
				manager: {
					select: {
						id: true,
					},
				},
			},
		});

		if (!hotel || !hotel.is_active) {
			throw new NotFoundException('Hotel not found');
		}

		// Check ownership
		if (!isAdmin && managerId) {
			if (hotel.manager_id !== managerId) {
				throw new ForbiddenException('You can only upload images to your own hotels');
			}
		}

		if (!files || files.length === 0) {
			throw new BadRequestException('No files uploaded');
		}

		try {
			// Upload to Cloudinary
			const uploadResults = await this.cloudinaryService.uploadMultipleImages(
				files,
				'hotels',
				{
					transformation: [
						{ width: 1200, height: 800, crop: 'fill', quality: 'auto' },
						{ fetch_format: 'auto' }
					]
				}
			);

			// Get current max order
			const maxOrder = await this.prisma.hotelImage.findFirst({
				where: { hotel_id: hotelId },
				orderBy: { display_order: 'desc' },
			});

			const startOrder = (maxOrder?.display_order || -1) + 1;

			// Save to database
			const imageRecords = await this.prisma.hotelImage.createMany({
				data: uploadResults.map((result: any, index: number) => ({
					hotel_id: hotelId,
					image_url: result.secure_url,
					public_id: result.public_id,
					display_order: startOrder + index,
				})),
			});

			return {
				message: `${files.length} image(s) uploaded successfully`,
				images: uploadResults.map((result: any) => ({
					url: result.secure_url,
					public_id: result.public_id,
				})),
			};
		} catch (error) {
			console.error('Upload error:', error);
			throw new BadRequestException('Failed to upload images');
		}
	}

	/**
	 * Delete hotel image from Cloudinary and database (Admin or Hotel Manager - must own the hotel)
	 */
	async removeImageWithCloudinary(hotelId: number, imageId: number, managerId?: number, isAdmin: boolean = false) {
		const image = await this.prisma.hotelImage.findFirst({
			where: { id: imageId, hotel_id: hotelId },
			include: {
				hotel: {
					include: {
						manager: {
							select: {
								id: true,
							},
						},
					},
				},
			},
		}) as any;

		if (!image) {
			throw new NotFoundException('Image not found');
		}

		// Check ownership
		if (!isAdmin && managerId) {
			if (image.hotel.manager_id !== managerId) {
				throw new ForbiddenException('You can only delete images from your own hotels');
			}
		}

		try {
			// Delete from Cloudinary if public_id exists
			if (image.public_id) {
				await this.cloudinaryService.deleteImage(image.public_id);
			}
			
			// Delete from database
			await this.prisma.hotelImage.delete({
				where: { id: imageId },
			});

			return { message: 'Image deleted successfully' };
		} catch (error) {
			console.error('Delete error:', error);
			throw new BadRequestException('Failed to delete image');
		}
	}

	/**
	 * Get optimized image URLs for different sizes
	 */
	async getOptimizedImages(hotelId: number) {
		const images = await this.prisma.hotelImage.findMany({
			where: { hotel_id: hotelId },
			orderBy: { display_order: 'asc' },
		}) as any[];

		return images.map(image => ({
			id: image.id,
			original: image.image_url,
			responsive: image.public_id ? 
				this.cloudinaryService.generateResponsiveUrls(image.public_id) : 
				{
					thumbnail: image.image_url,
					medium: image.image_url,
					large: image.image_url,
					original: image.image_url
				}
		}));
	}

	/**
	 * Get all hotels for a manager
	 */
	async getManagerHotels(managerId: number) {
		const hotels = await this.prisma.hotel.findMany({
			where: { manager_id: managerId },
			include: {
				city: { select: { id: true, name: true, region: true } },
				images: {
					orderBy: { display_order: 'asc' },
					take: 1,
				},
				roomTypes: {
					where: { is_active: true },
				},
				hotelBookings: {
					where: {
						status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
					},
					select: {
						id: true,
						total_amount: true,
					},
				},
			},
			orderBy: { created_at: 'desc' },
		});

		return hotels.map(hotel => {
			const totalEarnings = hotel.hotelBookings.reduce(
				(sum, booking) => sum + parseFloat(booking.total_amount.toString()),
				0
			);
			const managerEarnings = totalEarnings * 0.95; // 95% to manager

			return {
				id: hotel.id.toString(),
				name: hotel.name,
				description: hotel.description,
				location: hotel.city.name,
				address: hotel.address,
				rating: hotel.star_rating,
				is_active: hotel.is_active,
				is_listed: hotel.is_listed,
				images: hotel.images.map(img => img.image_url),
				room_types_count: hotel.roomTypes.length,
				total_bookings: hotel.hotelBookings.length,
				total_earnings: managerEarnings,
				created_at: hotel.created_at.toISOString(),
				updated_at: hotel.updated_at.toISOString(),
			};
		});
	}

	/**
	 * Update hotel availability/listing status
	 */
	async updateHotelAvailability(hotelId: number, managerId: number, data: { is_listed?: boolean }) {
		const hotel = await this.prisma.hotel.findUnique({
			where: { id: hotelId },
			include: {
				manager: {
					select: {
						id: true,
						is_verified: true,
					},
				},
			},
		});

		if (!hotel) {
			throw new NotFoundException('Hotel not found');
		}

		if (hotel.manager_id !== managerId) {
			throw new ForbiddenException('You can only update your own hotels');
		}

		if (!hotel.manager?.is_verified) {
			throw new ForbiddenException('Hotel manager must be verified to list hotels');
		}

		const updated = await this.prisma.hotel.update({
			where: { id: hotelId },
			data: {
				is_listed: data.is_listed !== undefined ? data.is_listed : hotel.is_listed,
			},
		});

		return {
			id: updated.id,
			is_listed: updated.is_listed,
			message: 'Hotel availability updated successfully',
		};
	}

	/**
	 * Get hotel availability stats
	 */
	async getHotelAvailability(hotelId: number, managerId: number) {
		const hotel = await this.prisma.hotel.findUnique({
			where: { id: hotelId },
			include: {
				manager: {
					select: {
						id: true,
					},
				},
				roomTypes: {
					where: { is_active: true },
					select: {
						id: true,
						name: true,
						total_rooms: true,
					},
				},
			},
		});

		if (!hotel) {
			throw new NotFoundException('Hotel not found');
		}

		if (hotel.manager_id !== managerId) {
			throw new ForbiddenException('You can only view availability for your own hotels');
		}

		const now = new Date();
		now.setHours(0, 0, 0, 0);

		// Calculate availability for each room type
		const availability = await Promise.all(
			hotel.roomTypes.map(async (roomType) => {
				const bookedBookings = await this.prisma.hotelBooking.findMany({
					where: {
						hotel_id: hotelId,
						room_type_id: roomType.id,
						status: 'CONFIRMED',
						check_out: { gte: now },
					},
					select: {
						quantity: true,
					},
				});

				const bookedRooms = bookedBookings.reduce((sum, b) => sum + b.quantity, 0);
				const availableRooms = Math.max(0, roomType.total_rooms - bookedRooms);

				return {
					room_type_id: roomType.id,
					room_type_name: roomType.name,
					total_rooms: roomType.total_rooms,
					booked_rooms: bookedRooms,
					available_rooms: availableRooms,
				};
			})
		);

		return {
			hotel_id: hotelId,
			hotel_name: hotel.name,
			is_listed: hotel.is_listed,
			room_availability: availability,
		};
	}
}


