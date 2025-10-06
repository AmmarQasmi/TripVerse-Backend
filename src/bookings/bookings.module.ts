import { Module } from '@nestjs/common';
import { HotelBookingsController } from './hotel-bookings.controller';
import { CarBookingsController } from './car-bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
	controllers: [HotelBookingsController, CarBookingsController],
	providers: [BookingsService],
})
export class BookingsModule {}


