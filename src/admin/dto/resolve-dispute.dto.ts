import { IsNotEmpty, IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class ResolveDisputeDto {
	@IsNotEmpty()
	@IsString()
	resolution!: string;

	@IsOptional()
	@IsNumber()
	@Min(0)
	refund_amount?: number;
}

