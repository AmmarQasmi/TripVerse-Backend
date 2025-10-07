import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT Authentication Guard
 * 
 * This guard validates JWT tokens using Passport JWT strategy.
 * It checks for valid JWT tokens in the Authorization header.
 * 
 * Usage:
 * @UseGuards(JwtAuthGuard)
 * @Controller('protected-route')
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
