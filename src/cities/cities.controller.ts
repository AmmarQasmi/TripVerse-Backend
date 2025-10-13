import { Controller, Get, Query } from '@nestjs/common';
import { CitiesService } from '../cities/cities.service';

@Controller('cities')
export class CitiesController {
	constructor(private readonly citiesService: CitiesService) {}

	@Get()
	async getAllCities(@Query('region') region?: string) {
		return this.citiesService.findAll(region);
	}

	@Get('regions')
	async getRegions() {
		return this.citiesService.findAllRegions();
	}
}

