import { IsString, IsOptional, IsUrl } from 'class-validator';

export class CreateLinkSessionDto {
	@IsString()
	offer_id!: string; // Duffel offer ID

	@IsOptional()
	@IsString()
	reference?: string; // Optional reference for tracking

	@IsOptional()
	@IsUrl()
	success_url?: string; // URL to redirect after successful booking

	@IsOptional()
	@IsUrl()
	failure_url?: string; // URL to redirect after failed booking

	@IsOptional()
	@IsUrl()
	abandonment_url?: string; // URL to redirect if user abandons booking
}

