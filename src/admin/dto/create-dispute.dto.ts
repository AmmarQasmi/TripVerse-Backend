import {
	IsNotEmpty,
	IsString,
	IsOptional,
	IsEnum,
	IsInt,
	IsDateString,
	ValidateIf,
	MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
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
	 * Complaint category — required for automated scoring.
	 * safety/fraud require supporting evidence.
	 */
	@IsNotEmpty()
	@IsEnum(DisputeCategory)
	category!: DisputeCategory;

	/** Complaint description — minimum 20 characters for meaningful context */
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
}


