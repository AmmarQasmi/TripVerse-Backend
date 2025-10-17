import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HotelsService {
	constructor(private prisma: PrismaService) {}

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
		const where: any = { is_active: true };

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
	async findOne(id: number) {
		const hotel = await this.prisma.hotel.findUnique({
			where: { id },
			include: {
				city: { select: { id: true, name: true, region: true } },
				images: { orderBy: { display_order: 'asc' } },
				roomTypes: {
					where: { is_active: true },
					orderBy: { base_price: 'asc' },
				},
			},
		});

		if (!hotel || !hotel.is_active) {
			throw new NotFoundException('Hotel not found');
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
	 * Create new hotel (Admin only)
	 */
	async create(data: any) {
		// Validate city exists
		const city = await this.prisma.city.findUnique({
			where: { id: data.city_id },
		});

		if (!city) {
			throw new NotFoundException('City not found');
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
					description: data.description,
					address: data.address,
					star_rating: data.star_rating || 4,
					amenities: data.amenities || [],
					is_active: true,
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

		return {
			id: hotel.id,
			name: hotel.name,
			message: 'Hotel created successfully',
		};
	}

	/**
	 * Update hotel
	 */
	async update(id: number, data: any) {
		const hotel = await this.prisma.hotel.findUnique({ where: { id } });

		if (!hotel) {
			throw new NotFoundException('Hotel not found');
		}

		const updated = await this.prisma.hotel.update({
			where: { id },
			data: {
				name: data.name,
				description: data.description,
				address: data.address,
				star_rating: data.star_rating,
				amenities: data.amenities,
			},
		});

		return {
			id: updated.id,
			name: updated.name,
			message: 'Hotel updated successfully',
		};
	}

	/**
	 * Soft delete hotel
	 */
	async remove(id: number) {
		const hotel = await this.prisma.hotel.findUnique({ where: { id } });

		if (!hotel) {
			throw new NotFoundException('Hotel not found');
		}

		await this.prisma.hotel.update({
			where: { id },
			data: { is_active: false },
		});

		return { message: 'Hotel deactivated successfully' };
	}

	/**
	 * Add room type to hotel
	 */
	async addRoomType(hotelId: number, data: any) {
		const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });

		if (!hotel || !hotel.is_active) {
			throw new NotFoundException('Hotel not found');
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
	 * Update room type
	 */
	async updateRoomType(hotelId: number, roomId: number, data: any) {
		const roomType = await this.prisma.hotelRoomType.findFirst({
			where: { id: roomId, hotel_id: hotelId },
		});

		if (!roomType) {
			throw new NotFoundException('Room type not found');
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
	 * Delete room type
	 */
	async removeRoomType(hotelId: number, roomId: number) {
		const roomType = await this.prisma.hotelRoomType.findFirst({
			where: { id: roomId, hotel_id: hotelId },
		});

		if (!roomType) {
			throw new NotFoundException('Room type not found');
		}

		await this.prisma.hotelRoomType.update({
			where: { id: roomId },
			data: { is_active: false },
		});

		return { message: 'Room type deactivated successfully' };
	}

	/**
	 * Add images to hotel
	 */
	async addImages(hotelId: number, imageUrls: string[]) {
		const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });

		if (!hotel || !hotel.is_active) {
			throw new NotFoundException('Hotel not found');
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
	 * Delete hotel image
	 */
	async removeImage(hotelId: number, imageId: number) {
		const image = await this.prisma.hotelImage.findFirst({
			where: { id: imageId, hotel_id: hotelId },
		});

		if (!image) {
			throw new NotFoundException('Image not found');
		}

		await this.prisma.hotelImage.delete({
			where: { id: imageId },
		});

		return { message: 'Image deleted successfully' };
	}

	/**
	 * Reorder hotel images
	 */
	async reorderImages(hotelId: number, imageIds: number[]) {
		const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });

		if (!hotel) {
			throw new NotFoundException('Hotel not found');
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
}


