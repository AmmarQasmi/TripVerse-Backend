import { Controller, Get } from '@nestjs/common';
import { BookingsService } from './bookings.service';

@Controller('car-bookings')
export class CarBookingsController {
	constructor(private readonly bookingsService: BookingsService) {}

	@Get('health')
	health() {
		return { ok: true, service: 'car-bookings' };
	}
}


