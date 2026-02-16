import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ItineraryService } from './itinerary.service';

@Controller('itineraries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.client)
export class ItineraryController {
  constructor(private itineraryService: ItineraryService) {}

  /**
   * GET /itineraries
   * List all saved itineraries for the current user.
   */
  @Get()
  async listItineraries(@CurrentUser() user: any) {
    const data = await this.itineraryService.listItineraries(user.id);
    return { success: true, data };
  }

  /**
   * GET /itineraries/:id
   * Get full itinerary with preview and enriched data.
   */
  @Get(':id')
  async getItinerary(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.itineraryService.getItinerary(user.id, id);
    return { success: true, data };
  }

  /**
   * POST /itineraries/:id/enrich
   * Trigger enrichment pipeline (Places + Wikipedia + Weather).
   * Status: preview → enriching → complete
   */
  @Post(':id/enrich')
  async enrichItinerary(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.itineraryService.enrichItinerary(user.id, id);
    return { success: true, data };
  }

  /**
   * DELETE /itineraries/:id
   * Delete an itinerary.
   */
  @Delete(':id')
  async deleteItinerary(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.itineraryService.deleteItinerary(user.id, id);
    return { success: true, data };
  }
}
