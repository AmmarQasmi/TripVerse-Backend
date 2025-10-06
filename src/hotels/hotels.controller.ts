import { Controller, Get } from '@nestjs/common';
import { HotelsService } from './hotels.service';

@Controller('hotels')
export class HotelsController {
	constructor(private readonly hotelsService: HotelsService) {}

	@Get('health')
	health() {
		return { ok: true, service: 'hotels' };
	}
}


