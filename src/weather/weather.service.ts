import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';

interface GeocodingResponse {
	results?: Array<{
		id: number;
		name: string;
		latitude: number;
		longitude: number;
		country: string;
		admin1?: string;
	}>;
}

interface CurrentWeatherResponse {
	current: {
		temperature_2m: number;
		weather_code: number;
		relative_humidity_2m: number;
		wind_speed_10m: number;
		time: string;
	};
}

interface ForecastResponse {
	daily: {
		time: string[];
		weather_code: number[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
	};
}

@Injectable()
export class WeatherService {
	private readonly GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
	private readonly WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

	constructor() {}

	/**
	 * Get coordinates for a city name using Open-Meteo Geocoding API
	 */
	private async getCoordinates(cityName: string): Promise<{ lat: number; lon: number; name: string }> {
		try {
			const response: AxiosResponse<GeocodingResponse> = await axios.get(this.GEOCODING_API, {
				params: {
					name: cityName,
					count: 1,
					language: 'en',
					format: 'json',
				},
			});

			if (!response.data?.results || response.data.results.length === 0) {
				throw new HttpException(`City "${cityName}" not found`, HttpStatus.NOT_FOUND);
			}

			const result = response.data.results[0];
			return {
				lat: result.latitude,
				lon: result.longitude,
				name: result.name,
			};
		} catch (error: unknown) {
			if (error instanceof HttpException) {
				throw error;
			}
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new HttpException(
				`Failed to geocode city "${cityName}": ${errorMessage}`,
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}
	}

	/**
	 * Map Open-Meteo weather code to readable condition and icon
	 */
	private mapWeatherCode(code: number): { condition: string; icon: string } {
		// Open-Meteo WMO Weather Interpretation Codes
		const weatherMap: Record<number, { condition: string; icon: string }> = {
			0: { condition: 'Clear sky', icon: '☀️' },
			1: { condition: 'Mainly clear', icon: '🌤️' },
			2: { condition: 'Partly cloudy', icon: '⛅' },
			3: { condition: 'Overcast', icon: '☁️' },
			45: { condition: 'Foggy', icon: '🌫️' },
			48: { condition: 'Depositing rime fog', icon: '🌫️' },
			51: { condition: 'Light drizzle', icon: '🌦️' },
			53: { condition: 'Moderate drizzle', icon: '🌦️' },
			55: { condition: 'Dense drizzle', icon: '🌦️' },
			56: { condition: 'Light freezing drizzle', icon: '🌨️' },
			57: { condition: 'Dense freezing drizzle', icon: '🌨️' },
			61: { condition: 'Slight rain', icon: '🌧️' },
			63: { condition: 'Moderate rain', icon: '🌧️' },
			65: { condition: 'Heavy rain', icon: '🌧️' },
			66: { condition: 'Light freezing rain', icon: '🌨️' },
			67: { condition: 'Heavy freezing rain', icon: '🌨️' },
			71: { condition: 'Slight snow fall', icon: '❄️' },
			73: { condition: 'Moderate snow fall', icon: '❄️' },
			75: { condition: 'Heavy snow fall', icon: '❄️' },
			77: { condition: 'Snow grains', icon: '❄️' },
			80: { condition: 'Slight rain showers', icon: '🌦️' },
			81: { condition: 'Moderate rain showers', icon: '🌦️' },
			82: { condition: 'Violent rain showers', icon: '🌧️' },
			85: { condition: 'Slight snow showers', icon: '🌨️' },
			86: { condition: 'Heavy snow showers', icon: '🌨️' },
			95: { condition: 'Thunderstorm', icon: '⛈️' },
			96: { condition: 'Thunderstorm with slight hail', icon: '⛈️' },
			99: { condition: 'Thunderstorm with heavy hail', icon: '⛈️' },
		};

		return weatherMap[code] || { condition: 'Unknown', icon: '🌤️' };
	}

	/**
	 * Get current weather for a city
	 */
	async getCurrentWeather(cityName: string) {
		try {
			// Step 1: Get coordinates for the city
			const { lat, lon, name } = await this.getCoordinates(cityName);

			// Step 2: Fetch current weather
			const response: AxiosResponse<CurrentWeatherResponse> = await axios.get(this.WEATHER_API, {
				params: {
					latitude: lat,
					longitude: lon,
					current: 'temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m',
					timezone: 'auto',
				},
			});

			const current = response.data?.current;
			if (!current) {
				throw new HttpException('Invalid weather data received', HttpStatus.INTERNAL_SERVER_ERROR);
			}
			
			const { condition, icon } = this.mapWeatherCode(current.weather_code);

			return {
				temperature: Math.round(current.temperature_2m),
				condition,
				humidity: current.relative_humidity_2m,
				windSpeed: Math.round(current.wind_speed_10m),
				cityName: name,
				icon,
				weatherCode: current.weather_code,
				time: current.time,
			};
		} catch (error: unknown) {
			if (error instanceof HttpException) {
				throw error;
			}
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new HttpException(
				`Failed to fetch weather for "${cityName}": ${errorMessage}`,
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}
	}

	/**
	 * Get weather forecast for a city
	 */
	async getForecast(cityName: string, days: number = 7) {
		try {
			// Step 1: Get coordinates for the city
			const { lat, lon, name } = await this.getCoordinates(cityName);

			// Step 2: Fetch forecast
			const response: AxiosResponse<ForecastResponse> = await axios.get(this.WEATHER_API, {
				params: {
					latitude: lat,
					longitude: lon,
					daily: 'weather_code,temperature_2m_max,temperature_2m_min',
					timezone: 'auto',
					forecast_days: Math.min(days, 16), // Open-Meteo supports up to 16 days
				},
			});

			const daily = response.data?.daily;
			if (!daily || !daily.time || !daily.weather_code || !daily.temperature_2m_max || !daily.temperature_2m_min) {
				throw new HttpException('Invalid forecast data received', HttpStatus.INTERNAL_SERVER_ERROR);
			}
			
			const forecast = daily.time.map((time: string, index: number) => {
				const { condition, icon } = this.mapWeatherCode(daily.weather_code[index]);
				return {
					date: time,
					condition,
					icon,
					temperatureMax: Math.round(daily.temperature_2m_max[index]),
					temperatureMin: Math.round(daily.temperature_2m_min[index]),
					weatherCode: daily.weather_code[index],
				};
			});

			return {
				cityName: name,
				forecast,
			};
		} catch (error: unknown) {
			if (error instanceof HttpException) {
				throw error;
			}
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new HttpException(
				`Failed to fetch forecast for "${cityName}": ${errorMessage}`,
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}
	}
}

