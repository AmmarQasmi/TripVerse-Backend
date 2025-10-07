import { Injectable } from '@nestjs/common';
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
				client: true,
				driver: true,
				admin: true,
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
				region: true,
				created_at: true,
				client: true,
				driver: true,
				admin: true,
			},
		});
	}

	async createUser(data: {
		email: string;
		password: string;
		full_name: string;
		role: Role;
		region: string;
	}) {
		const hashedPassword = await bcrypt.hash(data.password, 10);

		const user = await this.prisma.user.create({
			data: {
				email: data.email,
				password_hash: hashedPassword,
				full_name: data.full_name,
				role: data.role,
				region: data.region,
			},
			select: {
				id: true,
				email: true,
				full_name: true,
				role: true,
				region: true,
				created_at: true,
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

		return user;
	}

	async validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
		return bcrypt.compare(plainPassword, hashedPassword);
	}
}

