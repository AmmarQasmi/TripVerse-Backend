import {
	Controller,
	Get,
	Post,
	Patch,
	Delete,
	Param,
	Query,
	Body,
	ParseIntPipe,
	UseGuards,
	UseInterceptors,
	UploadedFiles,
	BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { HotelsService } from './hotels.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { imageUploadConfig } from '../common/config/multer.config';
import { PrismaService } from '../prisma/prisma.service';
import { Inject } from '@nestjs/common';

@Controller('hotels')
export class HotelsController {
	constructor(
		private readonly hotelsService: HotelsService,
		@Inject(PrismaService) private readonly prisma: PrismaService,
	) {}

	private async getManagerId(user: any): Promise<number> {
		const hotelManager = await this.prisma.hotelManager.findFirst({
			where: { user_id: user.id },
		});
		if (!hotelManager) {
			throw new BadRequestException('Hotel manager profile not found');
		}
		return hotelManager.id;
	}

	/**
	 * Search hotels with filters
	 * GET /hotels?city_id=40&minPrice=5000&maxPrice=15000&amenities=wifi,pool&starRating=4,5
	 */
	@Get()
	async findAll(@Query() query: any) {
		return this.hotelsService.findAll(query);
	}

	/**
	 * Get hotel details by ID
	 * GET /hotels/:id
	 * Uses optional authentication to allow both authenticated and unauthenticated access
	 */
	@Get(':id')
	@UseGuards(OptionalJwtAuthGuard)
	async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: any) {
		const isAdmin = user?.role === Role.admin;
		let managerId: number | undefined;
		
		// If user is a hotel manager, get their manager ID to allow viewing their own hotels
		if (user && user.role === Role.hotel_manager) {
			try {
				managerId = await this.getManagerId(user);
			} catch (error) {
				// If manager profile not found, just continue without managerId
				managerId = undefined;
			}
		}
		
		return this.hotelsService.findOne(id, isAdmin, managerId);
	}

	/**
	 * Create new hotel (Hotel Manager only, must be verified)
	 * POST /hotels
	 */
	@Post()
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	async create(@Body() data: any, @CurrentUser() user: any) {
		// Get manager ID from user
		const hotelManager = await this.prisma.hotelManager.findFirst({
			where: { user_id: user.id },
		});
		if (!hotelManager) {
			throw new BadRequestException('Hotel manager profile not found');
		}
		return this.hotelsService.create(data, hotelManager.id);
	}

	/**
	 * Update hotel (Admin or Hotel Manager - must own the hotel)
	 * PATCH /hotels/:id
	 */
	@Patch(':id')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin, Role.hotel_manager)
	async update(@Param('id', ParseIntPipe) id: number, @Body() data: any, @CurrentUser() user: any) {
		const isAdmin = user.role === Role.admin;
		let managerId: number | undefined;
		if (!isAdmin) {
			const hotelManager = await this.prisma.hotelManager.findFirst({
				where: { user_id: user.id },
			});
			if (!hotelManager) {
				throw new BadRequestException('Hotel manager profile not found');
			}
			managerId = hotelManager.id;
		}
		return this.hotelsService.update(id, data, managerId, isAdmin);
	}

	/**
	 * Delete hotel (Admin or Hotel Manager - must own the hotel)
	 * DELETE /hotels/:id
	 */
	@Delete(':id')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin, Role.hotel_manager)
	async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
		const isAdmin = user.role === Role.admin;
		let managerId: number | undefined;
		if (!isAdmin) {
			const hotelManager = await this.prisma.hotelManager.findFirst({
				where: { user_id: user.id },
			});
			if (!hotelManager) {
				throw new BadRequestException('Hotel manager profile not found');
			}
			managerId = hotelManager.id;
		}
		return this.hotelsService.remove(id, managerId, isAdmin);
	}

	/**
	 * Add room type to hotel (Admin or Hotel Manager - must own the hotel)
	 * POST /hotels/:hotelId/rooms
	 */
	@Post(':hotelId/rooms')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin, Role.hotel_manager)
	async addRoomType(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Body() data: any,
		@CurrentUser() user: any,
	) {
		const isAdmin = user.role === Role.admin;
		let managerId: number | undefined;
		if (!isAdmin) {
			const hotelManager = await this.prisma.hotelManager.findFirst({
				where: { user_id: user.id },
			});
			if (!hotelManager) {
				throw new BadRequestException('Hotel manager profile not found');
			}
			managerId = hotelManager.id;
		}
		return this.hotelsService.addRoomType(hotelId, data, managerId, isAdmin);
	}

	/**
	 * Update room type (Admin or Hotel Manager - must own the hotel)
	 * PATCH /hotels/:hotelId/rooms/:roomId
	 */
	@Patch(':hotelId/rooms/:roomId')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin, Role.hotel_manager)
	async updateRoomType(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Param('roomId', ParseIntPipe) roomId: number,
		@Body() data: any,
		@CurrentUser() user: any,
	) {
		const isAdmin = user.role === Role.admin;
		let managerId: number | undefined;
		if (!isAdmin) {
			const hotelManager = await this.prisma.hotelManager.findFirst({
				where: { user_id: user.id },
			});
			if (!hotelManager) {
				throw new BadRequestException('Hotel manager profile not found');
			}
			managerId = hotelManager.id;
		}
		return this.hotelsService.updateRoomType(hotelId, roomId, data, managerId, isAdmin);
	}

	/**
	 * Delete room type (Admin or Hotel Manager - must own the hotel)
	 * DELETE /hotels/:hotelId/rooms/:roomId
	 */
	@Delete(':hotelId/rooms/:roomId')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin, Role.hotel_manager)
	async removeRoomType(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Param('roomId', ParseIntPipe) roomId: number,
		@CurrentUser() user: any,
	) {
		const isAdmin = user.role === Role.admin;
		let managerId: number | undefined;
		if (!isAdmin) {
			const hotelManager = await this.prisma.hotelManager.findFirst({
				where: { user_id: user.id },
			});
			if (!hotelManager) {
				throw new BadRequestException('Hotel manager profile not found');
			}
			managerId = hotelManager.id;
		}
		return this.hotelsService.removeRoomType(hotelId, roomId, managerId, isAdmin);
	}

	/**
	 * Add images to hotel (Admin or Hotel Manager - must own the hotel)
	 * POST /hotels/:hotelId/images
	 * Body: { imageUrls: ["url1", "url2"] }
	 */
	@Post(':hotelId/images')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin, Role.hotel_manager)
	async addImages(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Body('imageUrls') imageUrls: string[],
		@CurrentUser() user: any,
	) {
		const isAdmin = user.role === Role.admin;
		const managerId = !isAdmin ? await this.getManagerId(user) : undefined;
		return this.hotelsService.addImages(hotelId, imageUrls, managerId, isAdmin);
	}

	/**
	 * Delete hotel image (Admin or Hotel Manager - must own the hotel)
	 * DELETE /hotels/:hotelId/images/:imageId
	 */
	@Delete(':hotelId/images/:imageId')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin, Role.hotel_manager)
	async removeImage(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Param('imageId', ParseIntPipe) imageId: number,
		@CurrentUser() user: any,
	) {
		const isAdmin = user.role === Role.admin;
		const managerId = !isAdmin ? await this.getManagerId(user) : undefined;
		return this.hotelsService.removeImage(hotelId, imageId, managerId, isAdmin);
	}

	/**
	 * Reorder hotel images (Admin or Hotel Manager - must own the hotel)
	 * PATCH /hotels/:hotelId/images/reorder
	 * Body: { imageIds: [3, 1, 2] }
	 */
	@Patch(':hotelId/images/reorder')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin, Role.hotel_manager)
	async reorderImages(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Body('imageIds') imageIds: number[],
		@CurrentUser() user: any,
	) {
		const isAdmin = user.role === Role.admin;
		const managerId = !isAdmin ? await this.getManagerId(user) : undefined;
		return this.hotelsService.reorderImages(hotelId, imageIds, managerId, isAdmin);
	}

	/**
	 * Upload images to hotel using Cloudinary (Admin or Hotel Manager - must own the hotel)
	 * POST /hotels/:hotelId/images/upload
	 */
	@Post(':hotelId/images/upload')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin, Role.hotel_manager)
	@UseInterceptors(FilesInterceptor('images', 10, imageUploadConfig))
	async uploadImages(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@UploadedFiles() files: any[],
		@CurrentUser() user: any,
	) {
		if (!files || files.length === 0) {
			throw new BadRequestException('No files uploaded or invalid file type. Only JPG, JPEG, PNG, GIF, and WEBP images are allowed.');
		}

		// Validate file types
		const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
		for (const file of files) {
			if (!file.mimetype || !allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
				throw new BadRequestException(`Invalid file type: ${file.originalname}. Only JPG, JPEG, PNG, GIF, and WEBP images are allowed.`);
			}
		}

		const isAdmin = user.role === Role.admin;
		const managerId = !isAdmin ? await this.getManagerId(user) : undefined;
		return this.hotelsService.uploadImages(hotelId, files, managerId, isAdmin);
	}

	/**
	 * Delete hotel image from Cloudinary and database (Admin or Hotel Manager - must own the hotel)
	 * DELETE /hotels/:hotelId/images/:imageId/cloudinary
	 */
	@Delete(':hotelId/images/:imageId/cloudinary')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin, Role.hotel_manager)
	async removeImageWithCloudinary(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Param('imageId', ParseIntPipe) imageId: number,
		@CurrentUser() user: any,
	) {
		const isAdmin = user.role === Role.admin;
		const managerId = !isAdmin ? await this.getManagerId(user) : undefined;
		return this.hotelsService.removeImageWithCloudinary(hotelId, imageId, managerId, isAdmin);
	}

	/**
	 * Get optimized images for hotel
	 * GET /hotels/:hotelId/images/optimized
	 */
	@Get(':hotelId/images/optimized')
	async getOptimizedImages(@Param('hotelId', ParseIntPipe) hotelId: number) {
		return this.hotelsService.getOptimizedImages(hotelId);
	}

	/**
	 * Get manager's hotels (Hotel Manager only)
	 * GET /hotels/manager/hotels
	 */
	@Get('manager/hotels')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	async getManagerHotels(@CurrentUser() user: any) {
		const managerId = await this.getManagerId(user);
		return this.hotelsService.getManagerHotels(managerId);
	}

	/**
	 * Update hotel availability/listing status (Hotel Manager only)
	 * PATCH /hotels/:id/availability
	 * Body: { is_listed: true }
	 */
	@Patch(':id/availability')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	async updateHotelAvailability(
		@Param('id', ParseIntPipe) hotelId: number,
		@Body() data: { is_listed?: boolean },
		@CurrentUser() user: any,
	) {
		const managerId = await this.getManagerId(user);
		return this.hotelsService.updateHotelAvailability(hotelId, managerId, data);
	}

	/**
	 * Get hotel availability stats (Hotel Manager only)
	 * GET /hotels/:id/availability
	 */
	@Get(':id/availability')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	async getHotelAvailability(
		@Param('id', ParseIntPipe) hotelId: number,
		@CurrentUser() user: any,
	) {
		const managerId = await this.getManagerId(user);
		return this.hotelsService.getHotelAvailability(hotelId, managerId);
	}

	@Get('health')
	health() {
		return { ok: true, service: 'hotels' };
	}
}


