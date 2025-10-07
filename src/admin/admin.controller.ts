import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('admin')
export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	@Get('health')
	health() {
		return { ok: true, service: 'admin' };
	}

	// Example: Only admins can access this endpoint
	@Get('dashboard')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	getDashboard(@CurrentUser() user: any) {
		return {
			message: 'Admin dashboard - only accessible by admins',
			user: {
				id: user.id,
				email: user.email,
				role: user.role,
			},
		};
	}

	// Example: Only admins can access all users data
	@Get('all-users')
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles(Role.admin)
	getAllUsers(@CurrentUser() user: any) {
		return {
			message: 'All users endpoint - admins can see everything',
			note: 'Implement your logic here to fetch all users',
		};
	}
}


