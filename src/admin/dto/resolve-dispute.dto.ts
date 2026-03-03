import { IsNotEmpty, IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class ResolveDisputeDto {
	@IsNotEmpty()
	@IsString()
	resolution!: string;

	/** Fine amount deducted from driver/hotel wallet and credited to admin wallet */
	@IsOptional()
	@IsNumber()
	@Min(0)
	fine_amount?: number;
}

