import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class SignupDto {
	@IsNotEmpty()
	@IsString()
	full_name!: string;

	@IsNotEmpty()
	@IsEmail()
	email!: string;

	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	password!: string;

	@IsNotEmpty()
	@IsEnum(Role)
	role!: Role;

	@IsNotEmpty()
	@IsString()
	region!: string;
}

