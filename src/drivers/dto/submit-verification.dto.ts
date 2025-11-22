import { IsNotEmpty, IsString, IsEnum, IsNumber, Min, Max, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentType } from '@prisma/client';

class DocumentUploadDto {
	@IsNotEmpty()
	@IsEnum(DocumentType)
	document_type!: DocumentType;

	@IsNotEmpty()
	@IsString()
	document_url!: string;
}

class RatingUploadDto {
	@IsNotEmpty()
	@IsString()
	platform!: string; // "uber", "careem", "indrive"

	@IsNotEmpty()
	@IsNumber()
	@Min(4.0)
	@Max(5.0)
	rating!: number; // Must be 4.0 or higher

	@IsString()
	screenshot_url?: string; // Optional - at least one rating must have a screenshot
}

export class SubmitVerificationDto {
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => DocumentUploadDto)
	documents!: DocumentUploadDto[];

	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => RatingUploadDto)
	ratings!: RatingUploadDto[];
}

