import { IsNotEmpty, IsString } from 'class-validator';

export class SubmitVerificationDto {
	@IsNotEmpty()
	@IsString()
	license_image_url!: string;

	@IsNotEmpty()
	@IsString()
	rating_screenshot_url!: string;

	@IsNotEmpty()
	@IsString()
	rating_platform!: string; // "uber", "careem", "indrive"

	@IsNotEmpty()
	existing_rating!: number; // Must be 4.0 or higher
}

