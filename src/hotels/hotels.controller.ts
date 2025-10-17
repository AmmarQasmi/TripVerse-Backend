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
} from '@nestjs/common';
import { HotelsService } from './hotels.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('hotels')
export class HotelsController {
	constructor(private readonly hotelsService: HotelsService) {}

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
	 */
	@Get(':id')
	async findOne(@Param('id', ParseIntPipe) id: number) {
		return this.hotelsService.findOne(id);
	}

	/**
	 * Create new hotel (Admin only)
	 * POST /hotels
	 */
	@Post()
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async create(@Body() data: any) {
		return this.hotelsService.create(data);
	}

	/**
	 * Update hotel (Admin only)
	 * PATCH /hotels/:id
	 */
	@Patch(':id')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async update(@Param('id', ParseIntPipe) id: number, @Body() data: any) {
		return this.hotelsService.update(id, data);
	}

	/**
	 * Delete hotel (Admin only)
	 * DELETE /hotels/:id
	 */
	@Delete(':id')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async remove(@Param('id', ParseIntPipe) id: number) {
		return this.hotelsService.remove(id);
	}

	/**
	 * Add room type to hotel (Admin only)
	 * POST /hotels/:hotelId/rooms
	 */
	@Post(':hotelId/rooms')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async addRoomType(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Body() data: any,
	) {
		return this.hotelsService.addRoomType(hotelId, data);
	}

	/**
	 * Update room type (Admin only)
	 * PATCH /hotels/:hotelId/rooms/:roomId
	 */
	@Patch(':hotelId/rooms/:roomId')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async updateRoomType(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Param('roomId', ParseIntPipe) roomId: number,
		@Body() data: any,
	) {
		return this.hotelsService.updateRoomType(hotelId, roomId, data);
	}

	/**
	 * Delete room type (Admin only)
	 * DELETE /hotels/:hotelId/rooms/:roomId
	 */
	@Delete(':hotelId/rooms/:roomId')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async removeRoomType(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Param('roomId', ParseIntPipe) roomId: number,
	) {
		return this.hotelsService.removeRoomType(hotelId, roomId);
	}

	/**
	 * Add images to hotel (Admin only)
	 * POST /hotels/:hotelId/images
	 * Body: { imageUrls: ["url1", "url2"] }
	 */
	@Post(':hotelId/images')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async addImages(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Body('imageUrls') imageUrls: string[],
	) {
		return this.hotelsService.addImages(hotelId, imageUrls);
	}

	/**
	 * Delete hotel image (Admin only)
	 * DELETE /hotels/:hotelId/images/:imageId
	 */
	@Delete(':hotelId/images/:imageId')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async removeImage(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Param('imageId', ParseIntPipe) imageId: number,
	) {
		return this.hotelsService.removeImage(hotelId, imageId);
	}

	/**
	 * Reorder hotel images (Admin only)
	 * PATCH /hotels/:hotelId/images/reorder
	 * Body: { imageIds: [3, 1, 2] }
	 */
	@Patch(':hotelId/images/reorder')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async reorderImages(
		@Param('hotelId', ParseIntPipe) hotelId: number,
		@Body('imageIds') imageIds: number[],
	) {
		return this.hotelsService.reorderImages(hotelId, imageIds);
	}

	@Get('health')
	health() {
		return { ok: true, service: 'hotels' };
	}
}


