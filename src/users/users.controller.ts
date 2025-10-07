import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

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
}


