import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

/**
 * Simple in-memory per-user rate limiter for chat endpoints.
 * Allows `maxRequests` per `windowMs` milliseconds per user.
 * Not suitable for clustered deployments (use Redis-based throttler instead).
 */
@Injectable()
export class ChatRateLimitGuard implements CanActivate {
  private readonly store = new Map<number, { count: number; resetAt: number }>();
  private readonly maxRequests = 20;     // max 20 messages
  private readonly windowMs = 60 * 1000; // per 1 minute

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId: number | undefined = request.user?.id;
    if (!userId) return true; // Auth guard should have already rejected

    const now = Date.now();
    const entry = this.store.get(userId);

    if (!entry || now > entry.resetAt) {
      // New window
      this.store.set(userId, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many requests. Please wait ${retryAfter} seconds.`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count++;
    return true;
  }
}
