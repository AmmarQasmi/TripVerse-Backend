import { IsNotEmpty, IsString, IsEnum, IsArray, ValidateNested } from 'class-validator';
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

export class SubmitVerificationDto {
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => DocumentUploadDto)
	documents!: DocumentUploadDto[];
}

