import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
	constructor(private prisma: PrismaService) {}

	async findByEmail(email: string) {
		return this.prisma.user.findUnique({
			where: { email },
			include: {
				city: true,
				client: true,
				driver: true,
				admin: true,
				hotelManager: true,
			},
		});
	}

	async findById(id: number) {
		return this.prisma.user.findUnique({
			where: { id },
			select: {
				id: true,
				email: true,
				full_name: true,
				role: true,
				status: true,
				city_id: true,
				created_at: true,
				city: true,
				client: true,
				driver: true,
				admin: true,
				hotelManager: true,
			},
		});
	}

	async createUser(data: {
		email: string;
		password: string;
		full_name: string;
		role: Role;
		city_id: number;
	}) {
		const hashedPassword = await bcrypt.hash(data.password, 10);

		const user = await this.prisma.user.create({
			data: {
				email: data.email,
				password_hash: hashedPassword,
				full_name: data.full_name,
				role: data.role,
				city_id: data.city_id,
			},
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

		// Create role-specific record based on user role
		if (data.role === Role.client) {
			await this.prisma.client.create({
				data: {
					user_id: user.id,
				},
			});
		}

		if (data.role === Role.driver) {
			await this.prisma.driver.create({
				data: {
					user_id: user.id,
				},
			});
		}

		if (data.role === Role.admin) {
			await this.prisma.admin.create({
				data: {
					user_id: user.id,
				},
			});
		}

		if (data.role === Role.hotel_manager) {
			await this.prisma.hotelManager.create({
				data: {
					user_id: user.id,
				},
			});
		}

		return user;
	}

	async validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
		return bcrypt.compare(plainPassword, hashedPassword);
	}

	async updateProfile(userId: number, data: { full_name?: string; city_id?: number }) {
		return this.prisma.user.update({
			where: { id: userId },
			data: {
				...(data.full_name && { full_name: data.full_name }),
				...(data.city_id && { city_id: data.city_id }),
			},
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
	}

	async changePassword(userId: number, currentPassword: string, newPassword: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { password_hash: true },
		});

		if (!user) {
			throw new BadRequestException('User not found');
		}

		const isCurrentPasswordValid = await this.validatePassword(currentPassword, user.password_hash);
		if (!isCurrentPasswordValid) {
			throw new BadRequestException('Current password is incorrect');
		}

		const hashedNewPassword = await bcrypt.hash(newPassword, 10);

		await this.prisma.user.update({
			where: { id: userId },
			data: { password_hash: hashedNewPassword },
		});

		return { message: 'Password changed successfully' };
	}

	async changeEmail(userId: number, newEmail: string, password: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { email: true, password_hash: true },
		});

		if (!user) {
			throw new BadRequestException('User not found');
		}

		const isPasswordValid = await this.validatePassword(password, user.password_hash);
		if (!isPasswordValid) {
			throw new BadRequestException('Password is incorrect');
		}

		// Check if email already exists
		const existingUser = await this.prisma.user.findUnique({
			where: { email: newEmail },
		});

		if (existingUser && existingUser.id !== userId) {
			throw new ConflictException('Email already in use');
		}

		return this.prisma.user.update({
			where: { id: userId },
			data: { email: newEmail },
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
	}
}

