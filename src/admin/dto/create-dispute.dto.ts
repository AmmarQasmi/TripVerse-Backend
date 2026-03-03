import {
	IsNotEmpty,
	IsString,
	IsOptional,
	IsEnum,
	IsInt,
	IsDateString,
	ValidateIf,
	MinLength,
	IsArray,
	ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CancellationActor, DisputeCategory } from '@prisma/client';

export class CreateDisputeDto {
	/** Link to hotel booking (mutually exclusive with booking_car_id) */
	@IsOptional()
	@IsInt()
	@Type(() => Number)
	@ValidateIf((o) => !o.booking_car_id)
	booking_hotel_id?: number;

	/** Link to car booking (mutually exclusive with booking_hotel_id) */
	@IsOptional()
	@IsInt()
	@Type(() => Number)
	@ValidateIf((o) => !o.booking_hotel_id)
	booking_car_id?: number;

	/** Who is raising the complaint (auto-derived from JWT if omitted) */
	@IsOptional()
	@IsEnum(CancellationActor)
	raised_by?: CancellationActor;

	/**
	 * Multiple complaint categories selected by the customer.
	 * Sent as a repeated field (form-data) or array (JSON).
	 * safety/fraud require supporting evidence.
	 */
	@IsArray()
	@IsEnum(DisputeCategory, { each: true })
	@ArrayMinSize(1)
	@Transform(({ value }) => (Array.isArray(value) ? value : [value]))
	categories!: DisputeCategory[];

	/**
	 * Primary category (derived from categories array by service).
	 * Kept for backward-compatibility — do not send from frontend.
	 */
	@IsOptional()
	@IsEnum(DisputeCategory)
	category?: DisputeCategory;

	/** Complaint description — auto-generated from selected categories on the frontend */
	@IsNotEmpty()
	@IsString()
	@MinLength(20)
	description!: string;

	/** When the incident happened — used in timing scoring rules */
	@IsOptional()
	@IsDateString()
	incident_at?: string;

	/** Set automatically from JWT — do not send from the frontend */
	@IsOptional()
	@IsInt()
	@Type(() => Number)
	reporter_user_id?: number;

	/**
	 * Handled by multer via FileFieldsInterceptor — actual files are in req.files.evidence.
	 * This field declaration exists solely to prevent forbidNonWhitelisted from rejecting
	 * the multipart body when the field name appears before multer fully extracts it.
	 */
	@IsOptional()
	evidence?: any;
}


