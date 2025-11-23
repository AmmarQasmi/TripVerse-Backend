"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
let WeatherService = class WeatherService {
    constructor() {
        this.GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
        this.WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
    }
    async getCoordinates(cityName) {
        var _a;
        try {
            const response = await axios_1.default.get(this.GEOCODING_API, {
                params: {
                    name: cityName,
                    count: 1,
                    language: 'en',
                    format: 'json',
                },
            });
            if (!((_a = response.data) === null || _a === void 0 ? void 0 : _a.results) || response.data.results.length === 0) {
                throw new common_1.HttpException(`City "${cityName}" not found`, common_1.HttpStatus.NOT_FOUND);
            }
            const result = response.data.results[0];
            return {
                lat: result.latitude,
                lon: result.longitude,
                name: result.name,
            };
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new common_1.HttpException(`Failed to geocode city "${cityName}": ${errorMessage}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    mapWeatherCode(code) {
        const weatherMap = {
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
    async getCurrentWeather(cityName) {
        var _a;
        try {
            const { lat, lon, name } = await this.getCoordinates(cityName);
            const response = await axios_1.default.get(this.WEATHER_API, {
                params: {
                    latitude: lat,
                    longitude: lon,
                    current: 'temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m',
                    timezone: 'auto',
                },
            });
            const current = (_a = response.data) === null || _a === void 0 ? void 0 : _a.current;
            if (!current) {
                throw new common_1.HttpException('Invalid weather data received', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
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
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new common_1.HttpException(`Failed to fetch weather for "${cityName}": ${errorMessage}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getForecast(cityName, days = 7) {
        var _a;
        try {
            const { lat, lon, name } = await this.getCoordinates(cityName);
            const response = await axios_1.default.get(this.WEATHER_API, {
                params: {
                    latitude: lat,
                    longitude: lon,
                    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
                    timezone: 'auto',
                    forecast_days: Math.min(days, 16),
                },
            });
            const daily = (_a = response.data) === null || _a === void 0 ? void 0 : _a.daily;
            if (!daily || !daily.time || !daily.weather_code || !daily.temperature_2m_max || !daily.temperature_2m_min) {
                throw new common_1.HttpException('Invalid forecast data received', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
            }
            const forecast = daily.time.map((time, index) => {
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
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new common_1.HttpException(`Failed to fetch forecast for "${cityName}": ${errorMessage}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.WeatherService = WeatherService;
exports.WeatherService = WeatherService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], WeatherService);
//# sourceMappingURL=weather.service.js.map