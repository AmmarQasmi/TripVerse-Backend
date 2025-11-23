import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifyHotelManagerDto {
	@IsNotEmpty()
	@IsBoolean()
	is_verified!: boolean;

	@IsOptional()
	@IsString()
	verification_notes?: string;
}

