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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotelsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const cloudinary_service_1 = require("../common/cloudinary/cloudinary.service");
let HotelsService = class HotelsService {
    constructor(prisma, cloudinaryService) {
        this.prisma = prisma;
        this.cloudinaryService = cloudinaryService;
    }
    async findAll(query = {}) {
        const city_id = query.city_id ? parseInt(query.city_id) : null;
        const minPrice = query.minPrice ? parseFloat(query.minPrice) : 0;
        const maxPrice = query.maxPrice ? parseFloat(query.maxPrice) : 999999;
        const page = query.page ? parseInt(query.page) : 1;
        const limit = query.limit ? parseInt(query.limit) : 20;
        const amenities = query.amenities
            ? typeof query.amenities === 'string'
                ? query.amenities.split(',').map((a) => a.trim())
                : Array.isArray(query.amenities)
                    ? query.amenities
                    : []
            : [];
        const starRating = query.starRating
            ? typeof query.starRating === 'string'
                ? query.starRating.split(',').map((s) => parseInt(s.trim()))
                : Array.isArray(query.starRating)
                    ? query.starRating.map(Number)
                    : []
            : [];
        const where = { is_active: true };
        if (city_id) {
            where.city_id = city_id;
        }
        if (starRating.length > 0) {
            where.star_rating = { in: starRating };
        }
        const [hotels, total] = await Promise.all([
            this.prisma.hotel.findMany({
                where,
                include: {
                    city: { select: { id: true, name: true, region: true } },
                    images: {
                        orderBy: { display_order: 'asc' },
                        take: 1,
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
        const filteredHotels = hotels.filter((hotel) => {
            if (hotel.roomTypes.length === 0)
                return false;
            const minRoomPrice = Math.min(...hotel.roomTypes.map((r) => parseFloat(r.base_price.toString())));
            return minRoomPrice >= minPrice && minRoomPrice <= maxPrice;
        });
        const finalHotels = amenities.length > 0
            ? filteredHotels.filter((hotel) => {
                const hotelAmenities = hotel.amenities || [];
                return amenities.every((a) => hotelAmenities.includes(a));
            })
            : filteredHotels;
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
            amenities: hotel.amenities || [],
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
    async findOne(id) {
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
            throw new common_1.NotFoundException('Hotel not found');
        }
        return {
            id: hotel.id.toString(),
            name: hotel.name,
            description: hotel.description,
            location: hotel.city.name,
            address: hotel.address,
            rating: hotel.star_rating,
            images: hotel.images.map((img) => img.image_url),
            amenities: hotel.amenities || [],
            roomTypes: hotel.roomTypes.map((room) => ({
                id: room.id.toString(),
                hotelId: hotel.id.toString(),
                name: room.name,
                description: room.description,
                capacity: room.max_occupancy,
                pricePerNight: parseFloat(room.base_price.toString()),
                amenities: room.amenities || [],
                images: room.images || [],
            })),
            createdAt: hotel.created_at.toISOString(),
            updatedAt: hotel.updated_at.toISOString(),
        };
    }
    async create(data) {
        var _a;
        const city = await this.prisma.city.findUnique({
            where: { id: data.city_id },
        });
        if (!city) {
            throw new common_1.NotFoundException('City not found');
        }
        const validRoomTypes = ['SINGLE', 'DOUBLE', 'DELUXE', 'SUITE'];
        if (((_a = data.roomTypes) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            for (const room of data.roomTypes) {
                if (!validRoomTypes.includes(room.name)) {
                    throw new Error(`Invalid room type "${room.name}". Valid types: ${validRoomTypes.join(', ')}`);
                }
            }
        }
        const hotel = await this.prisma.$transaction(async (tx) => {
            var _a, _b;
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
            if (((_a = data.images) === null || _a === void 0 ? void 0 : _a.length) > 0) {
                await tx.hotelImage.createMany({
                    data: data.images.map((url, index) => ({
                        hotel_id: newHotel.id,
                        image_url: url,
                        display_order: index,
                    })),
                });
            }
            if (((_b = data.roomTypes) === null || _b === void 0 ? void 0 : _b.length) > 0) {
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
    async update(id, data) {
        const hotel = await this.prisma.hotel.findUnique({ where: { id } });
        if (!hotel) {
            throw new common_1.NotFoundException('Hotel not found');
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
    async remove(id) {
        const hotel = await this.prisma.hotel.findUnique({ where: { id } });
        if (!hotel) {
            throw new common_1.NotFoundException('Hotel not found');
        }
        await this.prisma.hotel.update({
            where: { id },
            data: { is_active: false },
        });
        return { message: 'Hotel deactivated successfully' };
    }
    async addRoomType(hotelId, data) {
        const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
        if (!hotel || !hotel.is_active) {
            throw new common_1.NotFoundException('Hotel not found');
        }
        const validRoomTypes = ['SINGLE', 'DOUBLE', 'DELUXE', 'SUITE'];
        if (!validRoomTypes.includes(data.name)) {
            throw new Error(`Invalid room type "${data.name}". Valid types: ${validRoomTypes.join(', ')}`);
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
    async updateRoomType(hotelId, roomId, data) {
        const roomType = await this.prisma.hotelRoomType.findFirst({
            where: { id: roomId, hotel_id: hotelId },
        });
        if (!roomType) {
            throw new common_1.NotFoundException('Room type not found');
        }
        if (data.name) {
            const validRoomTypes = ['SINGLE', 'DOUBLE', 'DELUXE', 'SUITE'];
            if (!validRoomTypes.includes(data.name)) {
                throw new Error(`Invalid room type "${data.name}". Valid types: ${validRoomTypes.join(', ')}`);
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
    async removeRoomType(hotelId, roomId) {
        const roomType = await this.prisma.hotelRoomType.findFirst({
            where: { id: roomId, hotel_id: hotelId },
        });
        if (!roomType) {
            throw new common_1.NotFoundException('Room type not found');
        }
        await this.prisma.hotelRoomType.update({
            where: { id: roomId },
            data: { is_active: false },
        });
        return { message: 'Room type deactivated successfully' };
    }
    async addImages(hotelId, imageUrls) {
        const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
        if (!hotel || !hotel.is_active) {
            throw new common_1.NotFoundException('Hotel not found');
        }
        const maxOrder = await this.prisma.hotelImage.findFirst({
            where: { hotel_id: hotelId },
            orderBy: { display_order: 'desc' },
        });
        const startOrder = ((maxOrder === null || maxOrder === void 0 ? void 0 : maxOrder.display_order) || -1) + 1;
        await this.prisma.hotelImage.createMany({
            data: imageUrls.map((url, index) => ({
                hotel_id: hotelId,
                image_url: url,
                display_order: startOrder + index,
            })),
        });
        return { message: `${imageUrls.length} image(s) added successfully` };
    }
    async removeImage(hotelId, imageId) {
        const image = await this.prisma.hotelImage.findFirst({
            where: { id: imageId, hotel_id: hotelId },
        });
        if (!image) {
            throw new common_1.NotFoundException('Image not found');
        }
        await this.prisma.hotelImage.delete({
            where: { id: imageId },
        });
        return { message: 'Image deleted successfully' };
    }
    async reorderImages(hotelId, imageIds) {
        const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
        if (!hotel) {
            throw new common_1.NotFoundException('Hotel not found');
        }
        await this.prisma.$transaction(imageIds.map((imageId, index) => this.prisma.hotelImage.updateMany({
            where: { id: imageId, hotel_id: hotelId },
            data: { display_order: index },
        })));
        return { message: 'Images reordered successfully' };
    }
    async uploadImages(hotelId, files) {
        const hotel = await this.prisma.hotel.findUnique({
            where: { id: hotelId }
        });
        if (!hotel || !hotel.is_active) {
            throw new common_1.NotFoundException('Hotel not found');
        }
        if (!files || files.length === 0) {
            throw new common_1.BadRequestException('No files uploaded');
        }
        try {
            const uploadResults = await this.cloudinaryService.uploadMultipleImages(files, 'hotels', {
                transformation: [
                    { width: 1200, height: 800, crop: 'fill', quality: 'auto' },
                    { fetch_format: 'auto' }
                ]
            });
            const maxOrder = await this.prisma.hotelImage.findFirst({
                where: { hotel_id: hotelId },
                orderBy: { display_order: 'desc' },
            });
            const startOrder = ((maxOrder === null || maxOrder === void 0 ? void 0 : maxOrder.display_order) || -1) + 1;
            const imageRecords = await this.prisma.hotelImage.createMany({
                data: uploadResults.map((result, index) => ({
                    hotel_id: hotelId,
                    image_url: result.secure_url,
                    public_id: result.public_id,
                    display_order: startOrder + index,
                })),
            });
            return {
                message: `${files.length} image(s) uploaded successfully`,
                images: uploadResults.map((result) => ({
                    url: result.secure_url,
                    public_id: result.public_id,
                })),
            };
        }
        catch (error) {
            console.error('Upload error:', error);
            throw new common_1.BadRequestException('Failed to upload images');
        }
    }
    async removeImageWithCloudinary(hotelId, imageId) {
        const image = await this.prisma.hotelImage.findFirst({
            where: { id: imageId, hotel_id: hotelId },
        });
        if (!image) {
            throw new common_1.NotFoundException('Image not found');
        }
        try {
            if (image.public_id) {
                await this.cloudinaryService.deleteImage(image.public_id);
            }
            await this.prisma.hotelImage.delete({
                where: { id: imageId },
            });
            return { message: 'Image deleted successfully' };
        }
        catch (error) {
            console.error('Delete error:', error);
            throw new common_1.BadRequestException('Failed to delete image');
        }
    }
    async getOptimizedImages(hotelId) {
        const images = await this.prisma.hotelImage.findMany({
            where: { hotel_id: hotelId },
            orderBy: { display_order: 'asc' },
        });
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
};
exports.HotelsService = HotelsService;
exports.HotelsService = HotelsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cloudinary_service_1.CloudinaryService])
], HotelsService);
//# sourceMappingURL=hotels.service.js.map