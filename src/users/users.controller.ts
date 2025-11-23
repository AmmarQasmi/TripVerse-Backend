import { Controller, Get, Put, Patch, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('users')
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Get('health')
	health() {
		return { ok: true, service: 'users' };
	}

	// Example: Any authenticated user (client, driver, or admin) can access
	@Get('profile')
	@UseGuards(JwtAuthGuard)
	async getProfile(@CurrentUser() user: any) {
		const profile = await this.usersService.findById(user.id);
		return {
			message: 'User profile',
			profile,
		};
	}

	// Example: Only clients and admins can access this
	@Get('client-dashboard')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.client)
	getClientDashboard(@CurrentUser() user: any) {
		return {
			message: 'Client dashboard - only accessible by clients (and admins)',
			user: {
				id: user.id,
				email: user.email,
				role: user.role,
			},
		};
	}

	/**
	 * Update user profile
	 * PUT /users/profile
	 */
	@Put('profile')
	@UseGuards(JwtAuthGuard)
	async updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
		const updatedUser = await this.usersService.updateProfile(user.id, dto);
		return {
			message: 'Profile updated successfully',
			user: updatedUser,
		};
	}

	/**
	 * Change password
	 * PATCH /users/password
	 */
	@Patch('password')
	@UseGuards(JwtAuthGuard)
	async changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
		return this.usersService.changePassword(user.id, dto.current_password, dto.new_password);
	}

	/**
	 * Change email
	 * PATCH /users/email
	 */
	@Patch('email')
	@UseGuards(JwtAuthGuard)
	async changeEmail(@CurrentUser() user: any, @Body() dto: ChangeEmailDto) {
		const updatedUser = await this.usersService.changeEmail(user.id, dto.new_email, dto.password);
		return {
			message: 'Email changed successfully',
			user: updatedUser,
		};
	}

	/**
	 * Get user settings
	 * GET /users/settings
	 */
	@Get('settings')
	@UseGuards(JwtAuthGuard)
	async getSettings(@CurrentUser() user: any) {
		// For now, return default settings. In future, can add UserSettings model
		return {
			notifications_enabled: true,
			email_notifications_enabled: true,
		};
	}

	/**
	 * Update user settings
	 * PUT /users/settings
	 */
	@Put('settings')
	@UseGuards(JwtAuthGuard)
	async updateSettings(@CurrentUser() user: any, @Body() dto: UpdateSettingsDto) {
		// For now, just return success. In future, can add UserSettings model to store preferences
		return {
			message: 'Settings updated successfully',
			settings: dto,
		};
	}
}


