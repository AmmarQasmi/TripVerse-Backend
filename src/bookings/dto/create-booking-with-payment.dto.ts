import { IsInt, IsString, IsNotEmpty, IsOptional, Min, Max, IsDateString, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBookingWithPaymentDto {
  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  hotel_id!: number;

  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  room_type_id!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'check_in must be in YYYY-MM-DD format' })
  check_in!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'check_out must be in YYYY-MM-DD format' })
  check_out!: string;

  @IsString()
  @IsOptional()
  guest_name?: string;

  @IsString()
  @IsOptional()
  guest_email?: string;

  @IsString()
  @IsOptional()
  guest_phone?: string;

  @IsString()
  @IsOptional()
  special_requests?: string;

  @IsString()
  @IsOptional()
  payment_method?: string; // 'card' | 'cash' — simulated for now
}
