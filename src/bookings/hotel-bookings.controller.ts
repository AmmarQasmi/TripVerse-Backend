import { Controller, Get } from '@nestjs/common';
import { BookingsService } from './bookings.service';

@Controller('hotel-bookings')
export class HotelBookingsController {
	constructor(private readonly bookingsService: BookingsService) {}

	@Get('health')
	health() {
		return { ok: true, service: 'hotel-bookings' };
	}
}


