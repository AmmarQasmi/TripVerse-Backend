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
import { CarsService } from './cars.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('cars')
export class CarsController {
	constructor(private readonly carsService: CarsService) {}

	/**
	 * Search available cars with filters
	 * GET /cars/search?city_id=1&start_date=2024-02-15&end_date=2024-02-17&seats=4&transmission=automatic
	 */
	@Get('search')
	async searchCars(@Query() query: any) {
		return this.carsService.searchCars(query);
	}

	/**
	 * Get car details by ID
	 * GET /cars/:id
	 */
	@Get(':id')
	async findOne(@Param('id', ParseIntPipe) id: number) {
		return this.carsService.findOne(id);
	}

	/**
	 * Calculate price for a specific car and route
	 * POST /cars/:id/calculate-price
	 */
	@Post(':id/calculate-price')
	async calculatePrice(
		@Param('id', ParseIntPipe) id: number,
		@Body() body: {
			pickup_location: string;
			dropoff_location: string;
			start_date: string;
			end_date: string;
			estimated_distance?: number; // Customer provides distance for now
		},
	) {
		return this.carsService.calculatePrice(
			id,
			body.pickup_location,
			body.dropoff_location,
			body.start_date,
			body.end_date,
			body.estimated_distance,
		);
	}

	/**
	 * Create booking request (Customer)
	 * POST /cars/bookings/request
	 */
	@Post('bookings/request')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.client)
	async createBookingRequest(@Request() req: any, @Body() body: any) {
		const userId = req.user.id;
		return this.carsService.createBookingRequest({
			...body,
			user_id: userId,
		});
	}

	/**
	 * Driver responds to booking request
	 * POST /cars/bookings/:id/respond
	 */
	@Post('bookings/:id/respond')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async respondToBooking(
		@Param('id', ParseIntPipe) bookingId: number,
		@Request() req: any,
		@Body() body: { response: 'accept' | 'reject'; driver_notes?: string },
	) {
		const driverId = req.user.id;
		return this.carsService.respondToBooking(bookingId, driverId, body.response, body.driver_notes);
	}

	/**
	 * Confirm booking with payment (Customer)
	 * POST /cars/bookings/:id/confirm
	 */
	@Post('bookings/:id/confirm')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.client)
	async confirmBooking(@Param('id', ParseIntPipe) bookingId: number, @Request() req: any) {
		const userId = req.user.id;
		return this.carsService.confirmBooking(bookingId, userId);
	}

	/**
	 * Get user's bookings (Customer)
	 * GET /cars/bookings/my-bookings
	 */
	@Get('bookings/my-bookings')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.client)
	async getUserBookings(@Request() req: any, @Query('status') status?: string) {
		const userId = req.user.id;
		return this.carsService.getUserBookings(userId, status);
	}

	/**
	 * Get driver's bookings
	 * GET /cars/bookings/driver-bookings
	 */
	@Get('bookings/driver-bookings')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async getDriverBookings(@Request() req: any, @Query('status') status?: string) {
		const driverId = req.user.id;
		return this.carsService.getDriverBookings(driverId, status);
	}

	/**
	 * Start trip (Driver) - Payment is processed here after OTP verification
	 * POST /cars/bookings/:id/start
	 */
	@Post('bookings/:id/start')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async startTrip(
		@Param('id', ParseIntPipe) bookingId: number, 
		@Request() req: any,
		@Body() body: { otp_code?: string }
	) {
		const driverId = req.user.id;
		return this.carsService.startTrip(bookingId, driverId, body.otp_code);
	}

	/**
	 * Complete trip (Driver)
	 * POST /cars/bookings/:id/complete
	 */
	@Post('bookings/:id/complete')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async completeTrip(@Param('id', ParseIntPipe) bookingId: number, @Request() req: any) {
		const driverId = req.user.id;
		return this.carsService.completeTrip(bookingId, driverId);
	}

	/**
	 * Get chat messages for a booking
	 * GET /cars/bookings/:id/chat
	 */
	@Get('bookings/:id/chat')
	@UseGuards(JwtAuthGuard)
	async getChatMessages(@Param('id', ParseIntPipe) bookingId: number, @Request() req: any) {
		const userId = req.user.id;
		return this.carsService.getChatMessages(bookingId, userId);
	}

	/**
	 * Send message in chat
	 * POST /cars/bookings/:id/chat/messages
	 */
	@Post('bookings/:id/chat/messages')
	@UseGuards(JwtAuthGuard)
	async sendMessage(
		@Param('id', ParseIntPipe) bookingId: number,
		@Request() req: any,
		@Body() body: { message: string },
	) {
		const senderId = req.user.id;
		return this.carsService.sendMessage(bookingId, senderId, body.message);
	}

	// =====================
	// DRIVER CAR MANAGEMENT (Admin/Driver endpoints)
	// =====================

	/**
	 * Add new car (Driver)
	 * POST /cars/driver/cars
	 */
	@Post('driver/cars')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async addCar(@Request() req: any, @Body() body: any) {
		const driverId = req.user.id;
		return this.carsService.addDriverCar(driverId, body);
	}

	/**
	 * Update car details (Driver)
	 * PATCH /cars/driver/cars/:id
	 */
	@Patch('driver/cars/:id')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async updateCar(@Param('id', ParseIntPipe) id: number, @Request() req: any, @Body() body: any) {
		const driverId = req.user.id;
		return this.carsService.updateDriverCar(driverId, id, body);
	}

	/**
	 * Get driver's cars
	 * GET /cars/driver/cars
	 */
	@Get('driver/cars')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async getDriverCars(@Request() req: any) {
		const driverId = req.user.id;
		return this.carsService.getDriverCars(driverId);
	}

	// =====================
	// ADMIN ENDPOINTS
	// =====================

	/**
	 * Get all cars (Admin)
	 * GET /cars/admin/all
	 */
	@Get('admin/all')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getAllCars(@Query() query: any) {
		return this.carsService.getAllCarsForAdmin(query);
	}

	/**
	 * Verify driver (Admin)
	 * PATCH /cars/admin/drivers/:id/verify
	 */
	@Patch('admin/drivers/:id/verify')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async verifyDriver(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
		return this.carsService.verifyDriverForAdmin(id, body);
	}

	/**
	 * Health check
	 * GET /cars/health
	 */
	@Get('health')
	health() {
		return { ok: true, service: 'cars' };
	}
}