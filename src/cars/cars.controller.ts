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
	Request,
	UseInterceptors,
	UploadedFiles,
	BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CarsService } from './cars.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { imageUploadConfig } from '../common/config/multer.config';
import { CalculatePriceDto } from './dto/calculate-price.dto';
import { CreateBookingDto, SwitchDriverModeDto } from './dto/create-booking.dto';

@Controller('cars')
export class CarsController {
	constructor(private readonly carsService: CarsService) {}

	/**
	 * Autocomplete location suggestions
	 * GET /cars/places/autocomplete?input=karachi&country=pk
	 */
	@Get('places/autocomplete')
	async autocompleteLocation(
		@Query('input') input: string,
		@Query('country') country?: string,
	) {
		return this.carsService.autocompleteLocation(input, country);
	}

	/**
	 * Search available cars with filters
	 * GET /cars/search?city_id=1&start_date=2024-02-15&end_date=2024-02-17&seats=4&transmission=automatic&booking_type=RENTAL|RIDE_HAILING
	 * 
	 * booking_type filter:
	 * - RENTAL: available_for_rental = true AND no conflicting date bookings
	 * - RIDE_HAILING: available_for_ride_hailing = true AND current_mode = 'ride_hailing' AND no active rides
	 * - If not specified, returns all available cars
	 */
	@Get('search')
	async searchCars(
		@Query('booking_type') bookingType?: 'RENTAL' | 'RIDE_HAILING',
		@Query() query?: any,
	) {
		return this.carsService.searchCars({ ...query, booking_type: bookingType });
	}

	/**
	 * Get all car models
	 * GET /cars/models
	 */
	@Get('models')
	async getCarModels() {
		return this.carsService.getAllCarModels();
	}

	/**
	 * Get popular cities with available drivers
	 * GET /cars/cities/popular
	 */
	@Get('cities/popular')
	async getPopularCities() {
		return this.carsService.getPopularCities();
	}

	/**
	 * Explore city info (weather, places, facts)
	 * GET /cars/cities/explore/:cityName
	 */
	@Get('cities/explore/:cityName')
	async exploreCityInfo(@Param('cityName') cityName: string) {
		return this.carsService.getCityExplorerData(cityName);
	}

	/**
	 * Health check
	 * GET /cars/health
	 */
	@Get('health')
	health() {
		return { ok: true, service: 'cars' };
	}

	/**
	 * Get car details by ID
	 * GET /cars/:id
	 * Uses optional authentication to allow both authenticated and unauthenticated access
	 */
	@Get(':id')
	@UseGuards(OptionalJwtAuthGuard)
	async findOne(
		@Param('id', ParseIntPipe) id: number,
		@CurrentUser() user?: any,
	) {
		const isAdmin = user?.role === Role.admin;
		let driverId: number | undefined;
		
		// If user is a driver, get their user ID to allow viewing their own cars
		if (user && user.role === Role.driver) {
			driverId = user.id;
		}
		
		return this.carsService.findOne(id, isAdmin, driverId);
	}

	/**
	 * Get unavailable dates / availability status for a car
	 * GET /cars/:id/unavailable-dates?mode=rental|ride_hailing
	 * 
	 * For RENTAL mode: Returns array of unavailable date ranges
	 * For RIDE_HAILING mode: Returns real-time availability status
	 */
	@Get(':id/unavailable-dates')
	async getUnavailableDates(
		@Param('id', ParseIntPipe) id: number,
		@Query('mode') mode?: 'rental' | 'ride_hailing',
	) {
		return this.carsService.getUnavailableDates(id, mode);
	}

	/**
	 * Calculate price for a specific car and route (unified dual-mode)
	 * POST /cars/:id/calculate-price
	 * 
	 * Supports both rental and ride-hailing modes:
	 * - booking_type: 'RENTAL' | 'RIDE_HAILING' (optional, auto-detected via geocoding)
	 * - start_date/end_date: Required for RENTAL, ignored for RIDE_HAILING
	 * - scheduled_pickup: Optional for RIDE_HAILING (defaults to now)
	 */
	@Post(':id/calculate-price')
	async calculatePrice(
		@Param('id', ParseIntPipe) id: number,
		@Body() body: CalculatePriceDto,
	) {
		return this.carsService.calculatePriceV2(id, body);
	}

	/**
	 * Create booking request (Customer) - unified dual-mode
	 * POST /cars/bookings/request
	 * 
	 * Supports both rental and ride-hailing modes:
	 * - booking_type: 'RENTAL' | 'RIDE_HAILING' (optional, auto-detected)
	 * - For RENTAL: start_date and end_date are required
	 * - For RIDE_HAILING: scheduled_pickup is optional (defaults to now)
	 */
	@Post('bookings/request')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.client)
	async createBookingRequest(@Request() req: any, @Body() body: CreateBookingDto) {
		const userId = req.user.id;
		return this.carsService.createBookingRequestV2({
			...body,
			user_id: userId,
		});
	}

	/**
	 * Switch driver mode (rental/ride-hailing)
	 * PATCH /cars/driver/mode
	 */
	@Patch('driver/mode')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async switchDriverMode(@Request() req: any, @Body() body: SwitchDriverModeDto) {
		const driverId = req.user.id;
		return this.carsService.switchDriverMode(driverId, body.mode);
	}

	/**
	 * Get current driver mode
	 * GET /cars/driver/mode
	 */
	@Get('driver/mode')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async getDriverMode(@Request() req: any) {
		const driverId = req.user.id;
		return this.carsService.getDriverMode(driverId);
	}

	/**
	 * Update ride-hailing settings for a car
	 * PATCH /cars/:id/ride-hailing-settings
	 */
	@Patch(':id/ride-hailing-settings')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async updateRideHailingSettings(
		@Param('id', ParseIntPipe) carId: number,
		@Request() req: any,
		@Body() body: {
			base_fare?: number;
			per_km_rate?: number;
			per_minute_rate?: number;
			minimum_fare?: number;
			available_for_rental?: boolean;
			available_for_ride_hailing?: boolean;
		},
	) {
		const driverId = req.user.id;
		return this.carsService.updateCarRideHailingSettings(carId, driverId, body);
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
	 * Cancel booking (Customer)
	 * POST /cars/bookings/:id/cancel
	 */
	@Post('bookings/:id/cancel')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.client)
	async cancelBooking(@Param('id', ParseIntPipe) bookingId: number, @Request() req: any) {
		const userId = req.user.id;
		return this.carsService.cancelBooking(bookingId, userId);
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
	 * Collect cash payment (Driver)
	 * POST /cars/bookings/:id/collect-cash
	 */
	@Post('bookings/:id/collect-cash')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async collectCash(
		@Param('id', ParseIntPipe) bookingId: number,
		@Request() req: any,
		@Body() body: { collected_amount: number },
	) {
		const driverId = req.user.id;
		return this.carsService.collectCash(bookingId, driverId, body.collected_amount);
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

	/**
	 * Mark all unread messages in a chat as read
	 * PATCH /cars/bookings/:id/chat/read
	 */
	@Patch('bookings/:id/chat/read')
	@UseGuards(JwtAuthGuard)
	async markMessagesAsRead(
		@Param('id', ParseIntPipe) bookingId: number,
		@Request() req: any,
	) {
		const userId = req.user.id;
		return this.carsService.markMessagesAsRead(bookingId, userId);
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

	/**
	 * Update car availability/listing status (Driver only)
	 * PATCH /cars/:id/availability
	 * Body: { is_listed: true }
	 */
	@Patch(':id/availability')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async updateCarAvailability(
		@Param('id', ParseIntPipe) carId: number,
		@Body() data: { is_listed?: boolean },
		@Request() req: any,
	) {
		const driverUserId = req.user.id;
		return this.carsService.updateCarAvailability(carId, driverUserId, data);
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
	 * Upload images to car using Cloudinary (Driver only)
	 * POST /cars/:carId/images/upload
	 */
	@Post(':carId/images/upload')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	@UseInterceptors(FilesInterceptor('images', 10, imageUploadConfig))
	async uploadCarImages(
		@Param('carId', ParseIntPipe) carId: number,
		@UploadedFiles() files: any[],
		@Request() req: any,
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
		
		// Verify the car belongs to the authenticated driver
		// Pass driverId to allow viewing own car even if inactive
		const car = await this.carsService.findOne(carId, false, req.user.id);
		if (car.driver.id !== req.user.id.toString()) {
			throw new BadRequestException('You can only upload images to your own cars');
		}
		
		return this.carsService.uploadCarImages(carId, files);
	}

	/**
	 * Delete car image from Cloudinary and database (Driver only)
	 * DELETE /cars/:carId/images/:imageId/cloudinary
	 */
	@Delete(':carId/images/:imageId/cloudinary')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async removeCarImageWithCloudinary(
		@Param('carId', ParseIntPipe) carId: number,
		@Param('imageId', ParseIntPipe) imageId: number,
		@Request() req: any,
	) {
		// Verify the car belongs to the authenticated driver
		// Pass driverId to allow viewing own car even if inactive
		const car = await this.carsService.findOne(carId, false, req.user.id);
		if (car.driver.id !== req.user.id.toString()) {
			throw new BadRequestException('You can only delete images from your own cars');
		}
		
		return this.carsService.removeCarImageWithCloudinary(carId, imageId);
	}

	/**
	 * Get optimized images for car
	 * GET /cars/:carId/images/optimized
	 */
	@Get(':carId/images/optimized')
	async getOptimizedCarImages(@Param('carId', ParseIntPipe) carId: number) {
		return this.carsService.getOptimizedCarImages(carId);
	}

	// ─── Driver Reviews ───────────────────────────────────────────────────────

	/**
	 * Check if user can review driver for a booking
	 * GET /cars/bookings/:id/can-review
	 */
	@Get('bookings/:id/can-review')
	@UseGuards(JwtAuthGuard)
	async canReviewDriver(@Param('id', ParseIntPipe) bookingId: number, @Request() req: any) {
		return this.carsService.canUserReviewDriver(req.user.id, bookingId);
	}

	/**
	 * Submit a review for the driver of a completed booking
	 * POST /cars/bookings/:id/review
	 */
	@Post('bookings/:id/review')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.client)
	async createDriverReview(
		@Param('id', ParseIntPipe) bookingId: number,
		@Request() req: any,
		@Body() body: { rating: number; comment?: string },
	) {
		return this.carsService.createDriverReview(req.user.id, bookingId, body);
	}

	/**
	 * Get reviews for a driver
	 * GET /cars/drivers/:driverId/reviews
	 */
	@Get('drivers/:driverId/reviews')
	async getDriverReviews(
		@Param('driverId', ParseIntPipe) driverId: number,
		@Query('page') page?: string,
		@Query('limit') limit?: string,
	) {
		return this.carsService.getDriverReviews(driverId, page ? +page : 1, limit ? +limit : 10);
	}

}