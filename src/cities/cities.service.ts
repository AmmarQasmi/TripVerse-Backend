import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CitiesService {
	constructor(private prisma: PrismaService) {}

	async findAll(region?: string) {
		return this.prisma.city.findMany({
			where: region ? { region } : undefined,
			orderBy: { name: 'asc' },
		});
	}

	async findAllRegions() {
		const cities = await this.prisma.city.findMany({
			select: { region: true },
			distinct: ['region'],
			orderBy: { region: 'asc' },
		});
		return cities.map((c) => c.region);
	}

	async findById(id: number) {
		return this.prisma.city.findUnique({
			where: { id },
		});
	}
}

