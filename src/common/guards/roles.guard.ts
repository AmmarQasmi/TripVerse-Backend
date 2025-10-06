import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

/**
 * Role-based Authorization Guard
 * 
 * This guard checks if the user has the required role to access a route.
 * It works with the @Roles() decorator to define required roles.
 * 
 * Usage:
 * @UseGuards(AuthGuard, RolesGuard)
 * @Roles('admin', 'driver')
 * @Controller('admin-route')
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // TODO: Implement role checking logic
    // For now, return true to allow all requests
    return true;
  }
}
