import { Controller, Get, Query, ParseIntPipe } from '@nestjs/common';
import { WeatherService } from './weather.service';

@Controller('weather')
export class WeatherController {
	constructor(private readonly weatherService: WeatherService) {}

	@Get('health')
	health() {
		return { ok: true, service: 'weather' };
	}

	@Get('current')
	async getCurrentWeather(@Query('city') city: string) {
		if (!city) {
			throw new Error('City parameter is required');
		}
		return this.weatherService.getCurrentWeather(city);
	}

	@Get('forecast')
	async getForecast(
		@Query('city') city: string,
		@Query('days', new ParseIntPipe({ optional: true })) days?: number,
	) {
		if (!city) {
			throw new Error('City parameter is required');
		}
		return this.weatherService.getForecast(city, days || 7);
	}
}


