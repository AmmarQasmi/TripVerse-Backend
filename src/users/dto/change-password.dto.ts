import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
	@IsString()
	@MinLength(6)
	current_password!: string;

	@IsString()
	@MinLength(6)
	new_password!: string;
}

