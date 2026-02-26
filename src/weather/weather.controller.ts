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

	/**
	 * Get current weather by coordinates (for geolocation)
	 */
	@Get('coordinates/current')
	async getCurrentWeatherByCoordinates(
		@Query('lat') lat: string,
		@Query('lon') lon: string,
	) {
		if (!lat || !lon) {
			throw new Error('Latitude and longitude parameters are required');
		}
		const latitude = parseFloat(lat);
		const longitude = parseFloat(lon);
		
		if (isNaN(latitude) || isNaN(longitude)) {
			throw new Error('Invalid latitude or longitude values');
		}
		
		return this.weatherService.getCurrentWeatherByCoordinates(latitude, longitude);
	}

	/**
	 * Get weather forecast by coordinates (for geolocation)
	 */
	@Get('coordinates/forecast')
	async getForecastByCoordinates(
		@Query('lat') lat: string,
		@Query('lon') lon: string,
		@Query('days', new ParseIntPipe({ optional: true })) days?: number,
	) {
		if (!lat || !lon) {
			throw new Error('Latitude and longitude parameters are required');
		}
		const latitude = parseFloat(lat);
		const longitude = parseFloat(lon);
		
		if (isNaN(latitude) || isNaN(longitude)) {
			throw new Error('Invalid latitude or longitude values');
		}
		
		return this.weatherService.getForecastByCoordinates(latitude, longitude, days || 7);
	}
}


