import { IsString, IsDateString, IsInt, Min, IsOptional, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchFlightsDto {
	@IsString()
	origin!: string; // IATA airport code (e.g., "JFK", "LHR")

	@IsString()
	destination!: string; // IATA airport code

	@IsDateString()
	departure_date!: string; // ISO date string (e.g., "2024-12-25")

	@IsOptional()
	@IsDateString()
	return_date?: string; // Optional for round trips

	@Type(() => Number)
	@IsInt()
	@Min(1)
	adults: number = 1;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	children?: number = 0;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	infants?: number = 0;

	@IsOptional()
	@IsString()
	@IsIn(['economy', 'premium_economy', 'business', 'first'])
	cabin_class?: string = 'economy';
}

