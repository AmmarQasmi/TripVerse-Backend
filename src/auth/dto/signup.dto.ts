import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength, IsInt } from 'class-validator';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';

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
	@IsInt()
	@Type(() => Number)
	city_id!: number;
}

