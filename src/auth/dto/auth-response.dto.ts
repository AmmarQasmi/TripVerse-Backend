import { Role, AccountStatus } from '@prisma/client';

export class AuthResponseDto {
	access_token!: string;
	user!: {
		id: number;
		email: string;
		full_name: string;
		role: Role;
		status: AccountStatus;
		city: {
			id: number;
			name: string;
			region: string;
		};
	};
}

