import {
	Controller,
	Get,
	Post,
	Put,
	Patch,
	Delete,
	Param,
	Query,
	Body,
	UseGuards,
	ParseIntPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { VerifyDriverDto } from '../drivers/dto/verify-driver.dto';
import { VerifyHotelManagerDto } from '../hotel-managers/dto/verify-manager.dto';
import { SuspendDriverDto } from './dto/suspend-driver.dto';
import { BanDriverDto } from './dto/ban-driver.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { DriverFiltersDto } from './dto/driver-filters.dto';
import { DisputeFiltersDto } from './dto/dispute-filters.dto';
import { CreateDisputeDto } from './dto/create-dispute.dto';

@Controller('admin')
export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	@Get('health')
	health() {
		return { ok: true, service: 'admin' };
	}

	/**
	 * Get admin dashboard statistics
	 * GET /admin/dashboard
	 */
	@Get('dashboard')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getDashboard(@CurrentUser() user: any) {
		return this.adminService.getDashboardStats();
	}

	/**
	 * Get all drivers with filters
	 * GET /admin/drivers?page=1&limit=20&is_verified=true&city_id=1&status=pending
	 */
	@Get('drivers')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getAllDrivers(@Query() filters: DriverFiltersDto) {
		return this.adminService.getAllDrivers(filters);
	}

	/**
	 * Get drivers pending verification (legacy endpoint for backward compatibility)
	 * GET /admin/drivers/verification/pending
	 */
	@Get('drivers/verification/pending')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getPendingVerifications() {
		return this.adminService.getAllDrivers({ status: 'pending' });
	}

	/**
	 * Get all verified drivers (legacy endpoint for backward compatibility)
	 * GET /admin/drivers/verification/verified
	 */
	@Get('drivers/verification/verified')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getVerifiedDrivers() {
		return this.adminService.getAllDrivers({ is_verified: true });
	}

	/**
	 * Get drivers with pending suspensions
	 * GET /admin/drivers/pending-suspensions
	 * IMPORTANT: This must come before drivers/:id to avoid route conflict
	 */
	@Get('drivers/pending-suspensions')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getDriversWithPendingSuspensions() {
		return this.adminService.getDriversWithPendingSuspensions();
	}

	/**
	 * Get driver disciplinary history
	 * GET /admin/drivers/:id/disciplinary-history
	 */
	@Get('drivers/:id/disciplinary-history')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getDriverDisciplinaryHistory(@Param('id', ParseIntPipe) driverId: number) {
		return this.adminService.getDriverDisciplinaryHistory(driverId);
	}

	/**
	 * Get driver details
	 * GET /admin/drivers/:id
	 */
	@Get('drivers/:id')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getDriverDetails(@Param('id', ParseIntPipe) driverId: number) {
		return this.adminService.getDriverDetails(driverId);
	}

	/**
	 * Verify or reject driver
	 * PUT /admin/drivers/:id/verify
	 */
	@Put('drivers/:id/verify')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async verifyDriver(
		@Param('id', ParseIntPipe) driverId: number,
		@Body() dto: VerifyDriverDto,
		@CurrentUser() user: any,
	) {
		return this.adminService.verifyDriver(driverId, dto, user.id);
	}

	/**
	 * Suspend driver
	 * PATCH /admin/drivers/:id/suspend
	 */
	@Patch('drivers/:id/suspend')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async suspendDriver(
		@Param('id', ParseIntPipe) driverId: number,
		@Body() dto: SuspendDriverDto,
	) {
		return this.adminService.suspendDriver(driverId, dto);
	}

	/**
	 * Ban driver
	 * PATCH /admin/drivers/:id/ban
	 */
	@Patch('drivers/:id/ban')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async banDriver(
		@Param('id', ParseIntPipe) driverId: number,
		@Body() dto: BanDriverDto,
	) {
		return this.adminService.banDriver(driverId, dto);
	}

	/**
	 * Create a new dispute
	 * POST /admin/disputes
	 * Can be called by client, driver, or admin
	 */
	@Post('disputes')
	@UseGuards(JwtAuthGuard)
	async createDispute(@Body() dto: CreateDisputeDto, @CurrentUser() user: any) {
		// Set raised_by based on user role if not provided
		if (!dto.raised_by) {
			if (user.role === 'client') {
				dto.raised_by = 'client';
			} else if (user.role === 'driver') {
				dto.raised_by = 'driver';
			} else {
				dto.raised_by = 'admin';
			}
		}
		return this.adminService.createDispute(dto);
	}

	/**
	 * Get all disputes
	 * GET /admin/disputes?page=1&limit=20&status=pending&booking_type=car
	 */
	@Get('disputes')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getAllDisputes(@Query() filters: DisputeFiltersDto) {
		return this.adminService.getAllDisputes(filters);
	}

	/**
	 * Get dispute by ID
	 * GET /admin/disputes/:id
	 */
	@Get('disputes/:id')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getDisputeById(@Param('id', ParseIntPipe) disputeId: number) {
		return this.adminService.getDisputeById(disputeId);
	}

	/**
	 * Resolve dispute
	 * PATCH /admin/disputes/:id/resolve
	 */
	@Patch('disputes/:id/resolve')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async resolveDispute(
		@Param('id', ParseIntPipe) disputeId: number,
		@Body() dto: ResolveDisputeDto,
	) {
		return this.adminService.resolveDispute(disputeId, dto);
	}

	/**
	 * Get booking statistics
	 * GET /admin/reports/bookings?from=2024-01-01&to=2024-12-31
	 */
	@Get('reports/bookings')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getBookingStats(@Query('from') from?: string, @Query('to') to?: string) {
		const dateRange: any = {};
		if (from) dateRange.from = new Date(from);
		if (to) dateRange.to = new Date(to);
		return this.adminService.getBookingStats(dateRange);
	}

	/**
	 * Get driver performance statistics
	 * GET /admin/reports/drivers
	 */
	@Get('reports/drivers')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getDriverPerformanceStats() {
		return this.adminService.getDriverPerformanceStats();
	}

	/**
	 * Get revenue report
	 * GET /admin/reports/revenue?from=2024-01-01&to=2024-12-31
	 */
	@Get('reports/revenue')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getRevenueReport(@Query('from') from?: string, @Query('to') to?: string) {
		const dateRange: any = {};
		if (from) dateRange.from = new Date(from);
		if (to) dateRange.to = new Date(to);
		return this.adminService.getRevenueReport(dateRange);
	}

	/**
	 * Get all users
	 * GET /admin/users?page=1&limit=20&role=driver&status=active&city_id=1
	 */
	@Get('users')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getAllUsers(@Query() query: any) {
		return this.adminService.getAllUsers(query);
	}

	/**
	 * Admin: Get all hotels (including unlisted/unverified manager hotels)
	 * GET /admin/hotels?page=1&limit=20&city_id=1&is_listed=true
	 */
	@Get('hotels')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getAllHotels(@Query() query: any) {
		return this.adminService.getAllHotels(query);
	}

	/**
	 * Admin: Get hotel details (can view any hotel)
	 * GET /admin/hotels/:id
	 */
	@Get('hotels/:id')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getHotelDetails(@Param('id', ParseIntPipe) id: number) {
		return this.adminService.getHotelDetails(id);
	}

	/**
	 * Admin: Update any hotel
	 * PATCH /admin/hotels/:id
	 */
	@Patch('hotels/:id')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async updateHotel(@Param('id', ParseIntPipe) id: number, @Body() data: any) {
		return this.adminService.updateHotel(id, data);
	}

	/**
	 * Admin: Delete any hotel
	 * DELETE /admin/hotels/:id
	 */
	@Delete('hotels/:id')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async deleteHotel(@Param('id', ParseIntPipe) id: number) {
		return this.adminService.deleteHotel(id);
	}

	// =====================
	// HOTEL MANAGER MANAGEMENT
	// =====================

	/**
	 * Get all hotel managers with filters
	 * GET /admin/hotel-managers?page=1&limit=20&is_verified=true
	 */
	@Get('hotel-managers')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getAllHotelManagers(@Query() query: any) {
		return this.adminService.getAllHotelManagers(query);
	}

	/**
	 * Get hotel manager details
	 * GET /admin/hotel-managers/:id
	 */
	@Get('hotel-managers/:id')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getHotelManagerDetails(@Param('id', ParseIntPipe) id: number) {
		return this.adminService.getHotelManagerDetails(id);
	}

	/**
	 * Verify or reject hotel manager
	 * PUT /admin/hotel-managers/:id/verify
	 */
	@Put('hotel-managers/:id/verify')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async verifyHotelManager(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: VerifyHotelManagerDto,
		@CurrentUser() user: any,
	) {
		const result = await this.adminService.verifyHotelManager(id, dto);
		
		// Update reviewed_by for documents to the admin who reviewed
		if (result.hotel_manager) {
			await this.adminService.updateDocumentReviewer(id, user.id);
		}
		
		return result;
	}

	/**
	 * Get pending hotel managers
	 * GET /admin/hotel-managers/pending
	 */
	@Get('hotel-managers/pending')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getPendingHotelManagers() {
		return this.adminService.getPendingHotelManagers();
	}

	/**
	 * Get verified hotel managers
	 * GET /admin/hotel-managers/verified
	 */
	@Get('hotel-managers/verified')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getVerifiedHotelManagers() {
		return this.adminService.getVerifiedHotelManagers();
	}
}
