import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsDateString,
  IsPositive,
  ValidateIf,
  MinLength,
} from 'class-validator';
import { BookingTypeInput } from './calculate-price.dto';

/**
 * DTO for creating a car booking request
 * Supports both RENTAL and RIDE_HAILING booking types
 */
export class CreateBookingDto {
  @IsNumber()
  @IsPositive()
  car_id!: number;

  @IsString()
  @MinLength(3)
  pickup_location!: string;

  @IsString()
  @MinLength(3)
  dropoff_location!: string;

  /**
   * Booking type - REQUIRED (client must explicitly choose)
   */
  @IsEnum(BookingTypeInput, {
    message: 'booking_type must be either RENTAL or RIDE_HAILING',
  })
  booking_type!: BookingTypeInput;

  /**
   * Start date for RENTAL bookings (required if booking_type is RENTAL)
   */
  @ValidateIf((o) => o.booking_type === BookingTypeInput.RENTAL)
  @IsDateString({}, { message: 'start_date is required for RENTAL bookings' })
  start_date?: string;

  /**
   * End date for RENTAL bookings (required if booking_type is RENTAL)
   */
  @ValidateIf((o) => o.booking_type === BookingTypeInput.RENTAL)
  @IsDateString({}, { message: 'end_date is required for RENTAL bookings' })
  end_date?: string;

  /**
   * Exact pickup time for RIDE_HAILING bookings
   * If not provided for RIDE_HAILING, uses current time (immediate ride)
   */
  @IsOptional()
  @IsDateString()
  scheduled_pickup?: string;

  /**
   * Optional notes from the customer
   */
  @IsOptional()
  @IsString()
  customer_notes?: string;

  /**
   * Payment method (default: 'online')
   */
  @IsOptional()
  @IsEnum(['online', 'cash', 'wallet'], {
    message: 'payment_method must be online, cash, or wallet',
  })
  payment_method?: 'online' | 'cash' | 'wallet';
}

/**
 * DTO for driver mode switching
 */
export class SwitchDriverModeDto {
  @IsEnum(['offline', 'ride_hailing', 'rental'], {
    message: 'mode must be offline, ride_hailing, or rental',
  })
  mode!: 'offline' | 'ride_hailing' | 'rental';
}
