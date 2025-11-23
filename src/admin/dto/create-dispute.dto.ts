import { IsNotEmpty, IsString, IsOptional, IsEnum, IsInt, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { CancellationActor } from '@prisma/client';

export class CreateDisputeDto {
	@IsOptional()
	@IsInt()
	@Type(() => Number)
	@ValidateIf((o) => !o.booking_car_id)
	booking_hotel_id?: number;

	@IsOptional()
	@IsInt()
	@Type(() => Number)
	@ValidateIf((o) => !o.booking_hotel_id)
	booking_car_id?: number;

	@IsOptional()
	@IsEnum(CancellationActor)
	raised_by?: CancellationActor;

	@IsNotEmpty()
	@IsString()
	description!: string;
}

