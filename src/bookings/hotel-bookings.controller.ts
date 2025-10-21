import {
	Controller,
	Get,
	Post,
	Patch,
	Param,
	Query,
	Body,
	ParseIntPipe,
	UseGuards,
	Request,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('hotel-bookings')
export class HotelBookingsController {
	constructor(private readonly bookingsService: BookingsService) {}

	/**
	 * Create hotel booking request (Customer)
	 * POST /hotel-bookings/request
	 */
	@Post('request')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.client)
	async createBookingRequest(@Request() req: any, @Body() body: any) {
		const userId = req.user.id;
		return this.bookingsService.createHotelBookingRequest({
			...body,
			user_id: userId,
		});
	}

	/**
	 * Get user's hotel bookings (Customer)
	 * GET /hotel-bookings/my-bookings
	 */
	@Get('my-bookings')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.client)
	async getUserBookings(@Request() req: any, @Query('status') status?: string) {
		const userId = req.user.id;
		return this.bookingsService.getUserHotelBookings(userId, status);
	}

	/**
	 * Get hotel booking details
	 * GET /hotel-bookings/:id
	 */
	@Get(':id')
	@UseGuards(JwtAuthGuard)
	async getBookingDetails(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
		const userId = req.user.id;
		return this.bookingsService.getHotelBookingById(id, userId);
	}

	/**
	 * Confirm hotel booking with payment (Customer)
	 * POST /hotel-bookings/:id/confirm
	 */
	@Post(':id/confirm')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.client)
	async confirmBooking(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
		const userId = req.user.id;
		return this.bookingsService.confirmHotelBooking(id, userId);
	}

	/**
	 * Cancel hotel booking (Customer)
	 * PATCH /hotel-bookings/:id/cancel
	 */
	@Patch(':id/cancel')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.client)
	async cancelBooking(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
		const userId = req.user.id;
		return this.bookingsService.cancelHotelBooking(id, userId);
	}

	// =====================
	// ADMIN ENDPOINTS
	// =====================

	/**
	 * Get all hotel bookings (Admin)
	 * GET /hotel-bookings/admin/all
	 */
	@Get('admin/all')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getAllBookings(@Query() query: any) {
		return this.bookingsService.getAllHotelBookingsForAdmin(query);
	}

	@Get('health')
	health() {
		return { ok: true, service: 'hotel-bookings' };
	}
}


