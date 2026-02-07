import { IsOptional, IsString, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchFiltersDto {
	@IsOptional()
	@IsString()
	city?: string;

	@IsOptional()
	@IsString()
	region?: string;

	@IsOptional()
	@IsDateString()
	checkin?: string;

	@IsOptional()
	@IsDateString()
	checkout?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	guests?: number = 1;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	rooms?: number = 1;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	minPrice?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	maxPrice?: number;

	@IsOptional()
	@IsString()
	amenities?: string;

	@IsOptional()
	@IsString()
	starRating?: string;
}
