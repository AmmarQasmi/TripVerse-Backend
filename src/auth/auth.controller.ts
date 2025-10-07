import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('signup')
	async signup(@Body() signupDto: SignupDto): Promise<AuthResponseDto> {
		return this.authService.signup(signupDto);
	}

	@Post('login')
	@HttpCode(HttpStatus.OK)
	async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
		return this.authService.login(loginDto);
	}

	@Post('logout')
	@HttpCode(HttpStatus.OK)
	async logout() {
		// With JWT, logout is typically handled on the client side
		// by removing the token from storage
		// You can implement token blacklisting here if needed
		return {
			message: 'Logged out successfully. Please remove the token from client storage.',
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
}


