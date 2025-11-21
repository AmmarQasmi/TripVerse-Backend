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
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { imageUploadConfig } from '../common/config/multer.config';

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
		const car = await this.carsService.findOne(carId);
		if (car.driver.id !== req.user.id) {
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
		const car = await this.carsService.findOne(carId);
		if (car.driver.id !== req.user.id) {
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

	/**
	 * Health check
	 * GET /cars/health
	 */
	@Get('health')
	health() {
		return { ok: true, service: 'cars' };
	}
}