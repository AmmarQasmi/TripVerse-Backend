import { IsString, IsOptional, MinLength, MaxLength, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProfileDto {
	@IsOptional()
	@IsString()
	@MinLength(2)
	@MaxLength(100)
	full_name?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	city_id?: number;
}

