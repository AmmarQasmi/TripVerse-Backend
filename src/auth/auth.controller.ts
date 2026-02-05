import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus, Res, Req } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';


@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('signup')
	async signup(
		@Body() signupDto: SignupDto,
		@Res({ passthrough: true }) res: Response,
	) {
		const result = await this.authService.signup(signupDto);
		
		// Set httpOnly cookie with the JWT token
		this.setAuthCookie(res, result.access_token);
		
		// Return user data WITH token for testing (remove in production)
		return {
			user: result.user,
			access_token: result.access_token, // For bearer token testing
			message: 'Signup successful',
		};
	}

	@Post('login')
	@HttpCode(HttpStatus.OK)
	async login(
		@Body() loginDto: LoginDto,
		@Res({ passthrough: true }) res: Response,
	) {
		console.log('\n🔐 Login request received for:', loginDto.email);
		
		const result = await this.authService.login(loginDto);
		
		console.log('✅ Authentication successful, setting cookie...');
		
		// Set httpOnly cookie with the JWT token
		this.setAuthCookie(res, result.access_token);
		
		console.log('🍪 Cookie set, returning response\n');
		
		// Return user data WITH token for testing (remove in production)
		return {
			user: result.user,
			access_token: result.access_token, // For bearer token testing
			message: 'Login successful',
		};
	}

	@Post('logout')
	@HttpCode(HttpStatus.OK)
	async logout(@Res({ passthrough: true }) res: Response) {
		const isProduction = process.env.NODE_ENV === 'production';
		
		// Clear the httpOnly cookie with same options as when set
		res.clearCookie('access_token', {
			httpOnly: true,
			secure: isProduction,
			sameSite: isProduction ? 'none' : 'lax',
			path: '/',
		});
		
		return {
			message: 'Logged out successfully',
		};
	}

	@Get('me')
	@UseGuards(JwtAuthGuard)
	async getProfile(@CurrentUser() user: any) {
		const profile = await this.authService.getProfile(user.id);
		return { user: profile };
	}

	@Get('health')
	health() {
		return { ok: true, service: 'auth' };
	}

	@Get('check-cookie')
	checkCookie(@Req() req: Request) {
		// Debug endpoint to check if cookies are being received
		const cookies = req.cookies;
		const hasCookie = !!cookies?.access_token;
		
		return {
			hasCookie,
			cookieNames: Object.keys(cookies || {}),
			message: hasCookie 
				? 'Cookie is being sent correctly!' 
				: 'No cookie found - check CORS settings',
		};
	}

	/**
	 * Helper method to set authentication cookie
	 * Cookie flags explanation:
	 * - httpOnly: Prevents JavaScript access (XSS protection)
	 * - secure: Only sent over HTTPS in production (FALSE for localhost)
	 * - sameSite: CSRF protection (none = allows cross-site for Vercel-Render)
	 * - maxAge: Cookie expiration (7 days in milliseconds)
	 * - path: Cookie available for all routes
	 */
	private setAuthCookie(res: Response, token: string) {
		const isProduction = process.env.NODE_ENV === 'production';
		
		const cookieOptions: any = {
			httpOnly: true,
			secure: isProduction, // Use HTTPS in production
			sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-site in production
			maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
			path: '/',
		};
		
		console.log('🍪 Setting cookie with options:', {
			isProduction,
			secure: cookieOptions.secure,
			sameSite: cookieOptions.sameSite,
			httpOnly: cookieOptions.httpOnly,
			tokenLength: token.length,
			tokenPreview: token.substring(0, 20) + '...',
		});
		
		res.cookie('access_token', token, cookieOptions);
		
		// Log response headers for debugging
		console.log('📝 Set-Cookie header should be sent');
	}
}


