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
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateBookingWithPaymentDto } from './dto/create-booking-with-payment.dto';

@Controller('hotel-bookings')
export class HotelBookingsController {
	constructor(
		private readonly bookingsService: BookingsService,
		private readonly prisma: PrismaService,
	) {}

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
	 * Create booking with immediate payment (3-step modal flow)
	 * POST /hotel-bookings/create-with-payment
	 */
	@Post('create-with-payment')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.client)
	async createBookingWithPayment(
		@Request() req: any,
		@Body() body: CreateBookingWithPaymentDto,
	) {
		const userId = req.user.id;
		return this.bookingsService.createBookingWithPayment(userId, body);
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

	// =====================
	// HOTEL MANAGER ENDPOINTS
	// =====================

	/**
	 * Get hotel manager bookings for their hotels
	 * GET /hotel-bookings/manager/bookings?status=CONFIRMED
	 */
	@Get('manager/bookings')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	async getManagerBookings(@Request() req: any, @Query('status') status?: string) {
		const hotelManager = await this.prisma.hotelManager.findFirst({
			where: { user_id: req.user.id },
		});
		if (!hotelManager) {
			throw new Error('Hotel manager profile not found');
		}
		return this.bookingsService.getManagerHotelBookings(hotelManager.id, status);
	}

	/**
	 * Get hotel manager booking statistics
	 * GET /hotel-bookings/manager/stats?dateFrom=2024-01-01&dateTo=2024-12-31
	 */
	@Get('manager/stats')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.hotel_manager)
	async getManagerStats(
		@Request() req: any,
		@Query('dateFrom') dateFrom?: string,
		@Query('dateTo') dateTo?: string,
	) {
		const hotelManager = await this.prisma.hotelManager.findFirst({
			where: { user_id: req.user.id },
		});
		if (!hotelManager) {
			throw new Error('Hotel manager profile not found');
		}
		const from = dateFrom ? new Date(dateFrom) : undefined;
		const to = dateTo ? new Date(dateTo) : undefined;
		return this.bookingsService.getManagerBookingStats(hotelManager.id, from, to);
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


