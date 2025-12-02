import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional JWT Authentication Guard
 * 
 * This guard validates JWT tokens if present, but does not throw errors
 * if no token is provided. This allows endpoints to work for both
 * authenticated and unauthenticated users.
 * 
 * Usage:
 * @UseGuards(OptionalJwtAuthGuard)
 * @Controller('public-endpoint')
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Override canActivate to allow access even if authentication fails
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // Try to authenticate, but don't throw if it fails
      const result = await super.canActivate(context);
      return result as boolean;
    } catch (error) {
      // If authentication fails (no token, invalid token, etc.), allow access anyway
      // The request will continue without a user object
      return true;
    }
  }

  // Override handleRequest to return undefined instead of throwing errors
  handleRequest(err: any, user: any, info: any) {
    // If there's an error or no user, return undefined (don't throw)
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}
