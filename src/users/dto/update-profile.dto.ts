import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class UpdateProfileDto {
	@IsOptional()
	@IsString()
	@MinLength(2)
	@MaxLength(100)
	full_name?: string;

	@IsOptional()
	@IsString()
	city_id?: number;
}

