import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
	sub: number;
	email: string;
	role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(private prisma: PrismaService) {
		super({
			// Custom JWT extractor: Check cookie first, then Authorization header
			jwtFromRequest: ExtractJwt.fromExtractors([
				// 1. Extract from cookie (primary method)
				(request: Request) => {
					let token = null;
					if (request && request.cookies) {
						token = request.cookies['access_token'];
					}
					return token;
				},
				// 2. Fallback to Authorization header (for API clients/testing)
				ExtractJwt.fromAuthHeaderAsBearerToken(),
			]),
			ignoreExpiration: false,
			secretOrKey: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
		});
	}

	async validate(payload: JwtPayload) {
		const user = await this.prisma.user.findUnique({
			where: { id: payload.sub },
			select: {
				id: true,
				email: true,
				full_name: true,
				role: true,
				status: true,
				city_id: true,
				created_at: true,
				city: true,
			},
		});

		if (!user) {
			throw new UnauthorizedException('User not found');
		}

		// Check if account is banned or inactive
		if (user.status === 'banned') {
			throw new UnauthorizedException('Your account has been banned');
		}
		if (user.status === 'inactive') {
			throw new UnauthorizedException('Your account is inactive');
		}

		return user;
	}
}

