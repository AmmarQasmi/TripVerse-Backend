import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { VerifyDriverDto } from './dto/verify-driver.dto';

@Controller('drivers')
export class DriversController {
	constructor(private readonly driversService: DriversService) {}

	@Get('health')
	health() {
		return { ok: true, service: 'drivers' };
	}

	// Driver: Get own profile with verification status
	@Get('profile')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async getDriverProfile(@CurrentUser() user: any) {
		return this.driversService.getDriverProfile(user.id);
	}

	// Driver: Submit verification documents
	@Post('verification/submit')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.driver)
	async submitVerification(@CurrentUser() user: any, @Body() dto: SubmitVerificationDto) {
		return this.driversService.submitVerification(user.id, dto);
	}

	// Admin: Get drivers pending verification
	@Get('verification/pending')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getPendingVerifications() {
		return this.driversService.getPendingVerifications();
	}

	// Admin: Get all verified drivers
	@Get('verification/verified')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async getVerifiedDrivers() {
		return this.driversService.getVerifiedDrivers();
	}

	// Admin: Verify or reject driver
	@Put('verification/:driverId')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	async verifyDriver(@Param('driverId') driverId: string, @Body() dto: VerifyDriverDto) {
		return this.driversService.verifyDriver(Number(driverId), dto);
	}
}


