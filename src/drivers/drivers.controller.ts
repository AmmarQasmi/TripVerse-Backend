import { Controller, Get } from '@nestjs/common';
import { DriversService } from './drivers.service';

@Controller('drivers')
export class DriversController {
	constructor(private readonly driversService: DriversService) {}

	@Get('health')
	health() {
		return { ok: true, service: 'drivers' };
	}
}


