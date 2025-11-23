import { IsEmail, IsString, MinLength } from 'class-validator';

export class ChangeEmailDto {
	@IsEmail()
	new_email!: string;

	@IsString()
	@MinLength(6)
	password!: string;
}

