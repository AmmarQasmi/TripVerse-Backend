import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsDateString,
  IsPositive,
  ValidateIf,
} from 'class-validator';

export enum BookingTypeInput {
  RENTAL = 'RENTAL',
  RIDE_HAILING = 'RIDE_HAILING',
}

/**
 * DTO for calculating price estimate for a car booking
 * Supports both RENTAL (city-to-city, multi-day) and RIDE_HAILING (within-city, immediate/scheduled)
 */
export class CalculatePriceDto {
  @IsString()
  pickup_location!: string;

  @IsString()
  dropoff_location!: string;

  /**
   * Booking type - if not provided, will be auto-detected based on pickup/dropoff cities
   */
  @IsOptional()
  @IsEnum(BookingTypeInput, {
    message: 'booking_type must be either RENTAL or RIDE_HAILING',
  })
  booking_type?: BookingTypeInput;

  /**
   * Start date for RENTAL bookings (required if booking_type is RENTAL)
   */
  @ValidateIf((o) => o.booking_type === BookingTypeInput.RENTAL || (!o.booking_type && !o.scheduled_pickup))
  @IsDateString()
  start_date?: string;

  /**
   * End date for RENTAL bookings (required if booking_type is RENTAL)
   */
  @ValidateIf((o) => o.booking_type === BookingTypeInput.RENTAL || (!o.booking_type && !o.scheduled_pickup))
  @IsDateString()
  end_date?: string;

  /**
   * Exact pickup time for RIDE_HAILING bookings (optional - if not provided, uses current time)
   */
  @IsOptional()
  @IsDateString()
  scheduled_pickup?: string;

  /**
   * Pre-calculated distance in km (optional - will be calculated via Google API if not provided)
   */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  estimated_distance?: number;
}
