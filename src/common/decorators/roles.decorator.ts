import { SetMetadata } from '@nestjs/common';

/**
 * Roles Decorator
 * 
 * This decorator is used to specify which roles are required to access a route.
 * It works with the RolesGuard to implement role-based access control.
 * 
 * Usage:
 * @Roles('admin')
 * @Roles('admin', 'driver')
 * @Get('admin-only')
 */
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
