import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifyDriverDto {
	@IsNotEmpty()
	@IsBoolean()
	is_verified!: boolean;

	@IsOptional()
	@IsString()
	verification_notes?: string;
}

