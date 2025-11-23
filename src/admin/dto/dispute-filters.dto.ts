import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class DisputeFiltersDto {
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
	@IsString()
	status?: string; // 'pending', 'resolved', 'rejected'

	@IsOptional()
	@IsString()
	booking_type?: string; // 'hotel', 'car'
}

