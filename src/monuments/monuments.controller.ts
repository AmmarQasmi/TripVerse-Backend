import { Controller, Get } from '@nestjs/common';
import { MonumentsService } from './monuments.service';

@Controller('monuments')
export class MonumentsController {
	constructor(private readonly monumentsService: MonumentsService) {}

	@Get('health')
	health() {
		return { ok: true, service: 'monuments' };
	}
}


