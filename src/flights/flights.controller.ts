import {
	Controller,
	Get,
	Post,
	Query,
	Body,
	UseGuards,
	BadRequestException,
} from '@nestjs/common';
import { FlightsService } from './flights.service';
import { SearchFlightsDto } from './dto/search-flights.dto';
import { CreateLinkSessionDto } from './dto/create-link-session.dto';
import { OptionalJwtAuthGuard } from '../common/guards/optional-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('flights')
export class FlightsController {
	constructor(private readonly flightsService: FlightsService) {}

	/**
	 * Search for flights
	 * GET /flights/search?origin=JFK&destination=LHR&departure_date=2024-12-25&adults=1
	 */
	@Get('search')
	@UseGuards(OptionalJwtAuthGuard)
	async searchFlights(
		@Query() query: SearchFlightsDto,
		@CurrentUser() user?: any,
	) {
		// Validate required fields
		if (!query.origin || !query.destination || !query.departure_date) {
			throw new BadRequestException('Origin, destination, and departure_date are required');
		}

		// Validate IATA codes (basic validation - 3 uppercase letters)
		const iataCodeRegex = /^[A-Z]{3}$/;
		if (!iataCodeRegex.test(query.origin)) {
			throw new BadRequestException('Origin must be a valid 3-letter IATA airport code (e.g., JFK, LHR)');
		}
		if (!iataCodeRegex.test(query.destination)) {
			throw new BadRequestException('Destination must be a valid 3-letter IATA airport code (e.g., JFK, LHR)');
		}

		return this.flightsService.searchFlights(query);
	}

	/**
	 * Create a Duffel Link session for booking
	 * POST /flights/create-booking-link
	 */
	@Post('create-booking-link')
	@UseGuards(OptionalJwtAuthGuard)
	async createBookingLink(
		@Body() body: CreateLinkSessionDto,
		@CurrentUser() user?: any,
	) {
		if (!body.offer_id) {
			throw new BadRequestException('offer_id is required');
		}

		// Add user reference if authenticated
		if (user && !body.reference) {
			body.reference = `user_${user.id}_${Date.now()}`;
		}

		return this.flightsService.createBookingLink(body);
	}
}

