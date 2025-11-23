import { IsOptional, IsBoolean, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class DriverFiltersDto {
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number = 1;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	limit?: number = 20;

	@IsOptional()
	@Type(() => Boolean)
	@IsBoolean()
	is_verified?: boolean;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	city_id?: number;

	@IsOptional()
	@IsString()
	status?: string; // 'pending', 'verified', 'rejected'
}

