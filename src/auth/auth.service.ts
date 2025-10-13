import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
	constructor(
		private usersService: UsersService,
		private jwtService: JwtService,
	) {}

	async signup(signupDto: SignupDto): Promise<AuthResponseDto> {
		// Check if user already exists
		const existingUser = await this.usersService.findByEmail(signupDto.email);
		if (existingUser) {
			throw new ConflictException('User with this email already exists');
		}

		// Create new user
		const user = await this.usersService.createUser({
			email: signupDto.email,
			password: signupDto.password,
			full_name: signupDto.full_name,
			role: signupDto.role,
			city_id: signupDto.city_id,
		});

		// Generate JWT token
		const payload = { sub: user.id, email: user.email, role: user.role };
		const access_token = this.jwtService.sign(payload);

		return {
			access_token,
			user: {
				id: user.id,
				email: user.email,
				full_name: user.full_name,
				role: user.role,
				status: user.status,
				city: {
					id: user.city.id,
					name: user.city.name,
					region: user.city.region,
				},
			},
		};
	}

	async login(loginDto: LoginDto): Promise<AuthResponseDto> {
		// Find user by email
		const user = await this.usersService.findByEmail(loginDto.email);
		if (!user) {
			throw new UnauthorizedException('Invalid credentials');
		}

		// Check if account is banned or inactive
		if (user.status === 'banned') {
			throw new UnauthorizedException('Your account has been banned');
		}
		if (user.status === 'inactive') {
			throw new UnauthorizedException('Your account is inactive');
		}

		// Validate password
		const isPasswordValid = await this.usersService.validatePassword(
			loginDto.password,
			user.password_hash,
		);

		if (!isPasswordValid) {
			throw new UnauthorizedException('Invalid credentials');
		}

		// Generate JWT token
		const payload = { sub: user.id, email: user.email, role: user.role };
		const access_token = this.jwtService.sign(payload);

		return {
			access_token,
			user: {
				id: user.id,
				email: user.email,
				full_name: user.full_name,
				role: user.role,
				status: user.status,
				city: {
					id: user.city.id,
					name: user.city.name,
					region: user.city.region,
				},
			},
		};
	}

	async getProfile(userId: number) {
		const user = await this.usersService.findById(userId);
		if (!user) {
			throw new UnauthorizedException('User not found');
		}
		return {
			id: user.id,
			email: user.email,
			full_name: user.full_name,
			role: user.role,
			status: user.status,
			city: {
				id: user.city.id,
				name: user.city.name,
				region: user.city.region,
			},
			created_at: user.created_at,
		};
	}

	async validateUser(userId: number) {
		return this.usersService.findById(userId);
	}
}

