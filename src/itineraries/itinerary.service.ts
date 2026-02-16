import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ItineraryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EnrichmentService } from '../chat/services/enrichment.service';

@Injectable()
export class ItineraryService {
  private readonly logger = new Logger(ItineraryService.name);

  constructor(
    private prisma: PrismaService,
    private enrichmentService: EnrichmentService,
  ) {}

  // =============================================
  // CRUD Operations
  // =============================================

  /**
   * List all itineraries for a user.
   * Returns lightweight summaries (no enriched_data blob).
   */
  async listItineraries(userId: number) {
    const itineraries = await this.prisma.generatedItinerary.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        destination: true,
        duration_days: true,
        travel_style: true,
        budget: true,
        status: true,
        session_id: true,
        created_at: true,
        updated_at: true,
      },
    });

    return itineraries.map((it) => ({
      id: it.id,
      title: it.title,
      destination: it.destination,
      durationDays: it.duration_days,
      travelStyle: it.travel_style,
      budget: it.budget,
      status: it.status,
      sessionId: it.session_id,
      createdAt: it.created_at,
      updatedAt: it.updated_at,
    }));
  }

  /**
   * Get a single itinerary with all data.
   * If enriched_data exists, return that. Otherwise return preview_data.
   */
  async getItinerary(userId: number, itineraryId: number) {
    const itinerary = await this.prisma.generatedItinerary.findUnique({
      where: { id: itineraryId },
    });

    if (!itinerary) throw new NotFoundException('Itinerary not found');
    if (itinerary.user_id !== userId) throw new ForbiddenException('Access denied');

    return {
      id: itinerary.id,
      title: itinerary.title,
      destination: itinerary.destination,
      durationDays: itinerary.duration_days,
      travelStyle: itinerary.travel_style,
      budget: itinerary.budget,
      status: itinerary.status,
      sessionId: itinerary.session_id,
      previewData: itinerary.preview_data,
      enrichedData: itinerary.enriched_data,
      createdAt: itinerary.created_at,
      updatedAt: itinerary.updated_at,
    };
  }

  /**
   * Delete an itinerary.
   */
  async deleteItinerary(userId: number, itineraryId: number) {
    const itinerary = await this.prisma.generatedItinerary.findUnique({
      where: { id: itineraryId },
    });

    if (!itinerary) throw new NotFoundException('Itinerary not found');
    if (itinerary.user_id !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.generatedItinerary.delete({ where: { id: itineraryId } });
    return { message: 'Itinerary deleted successfully' };
  }

  // =============================================
  // Enrichment Pipeline
  // =============================================

  /**
   * Trigger enrichment for an itinerary.
   * Flow: preview → enriching → complete (or failed)
   */
  async enrichItinerary(userId: number, itineraryId: number) {
    const itinerary = await this.prisma.generatedItinerary.findUnique({
      where: { id: itineraryId },
    });

    if (!itinerary) throw new NotFoundException('Itinerary not found');
    if (itinerary.user_id !== userId) throw new ForbiddenException('Access denied');

    if (itinerary.status === ItineraryStatus.enriching) {
      // Allow retry if enrichment has been stuck for more than 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (itinerary.updated_at > fiveMinutesAgo) {
        throw new BadRequestException('This itinerary is already being enriched. Please wait a few minutes.');
      }
      this.logger.warn(`Stale enrichment detected for itinerary ${itineraryId} — allowing retry`);
    }

    if (itinerary.status === ItineraryStatus.complete && itinerary.enriched_data) {
      // Already enriched — return existing data
      return {
        id: itinerary.id,
        status: itinerary.status,
        enrichedData: itinerary.enriched_data,
      };
    }

    // Mark as enriching
    await this.prisma.generatedItinerary.update({
      where: { id: itineraryId },
      data: { status: ItineraryStatus.enriching },
    });

    try {
      const previewData = itinerary.preview_data as any;
      const enrichedData = await this.enrichmentService.enrichItinerary(previewData);

      // Save enriched data and mark as complete
      const updated = await this.prisma.generatedItinerary.update({
        where: { id: itineraryId },
        data: {
          enriched_data: enrichedData as any,
          status: ItineraryStatus.complete,
        },
      });

      this.logger.log(`Itinerary ${itineraryId} enriched successfully`);

      return {
        id: updated.id,
        title: updated.title,
        destination: updated.destination,
        durationDays: updated.duration_days,
        travelStyle: updated.travel_style,
        budget: updated.budget,
        status: updated.status,
        previewData: updated.preview_data,
        enrichedData: updated.enriched_data,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      };
    } catch (error: any) {
      this.logger.error(`Enrichment failed for itinerary ${itineraryId}: ${error.message}`);

      // Mark as failed
      await this.prisma.generatedItinerary.update({
        where: { id: itineraryId },
        data: { status: ItineraryStatus.failed },
      });

      throw new BadRequestException(
        'Enrichment failed. Please try again later.',
      );
    }
  }

  // =============================================
  // Internal — Called by ChatService
  // =============================================

  /**
   * Create a new itinerary from a chat preview.
   * Called by ChatService when Gemini generates a preview.
   */
  async createFromPreview(
    userId: number,
    sessionId: number,
    previewData: any,
    context: Record<string, any>,
  ) {
    // Check if one already exists for this session
    const existing = await this.prisma.generatedItinerary.findUnique({
      where: { session_id: sessionId },
    });

    if (existing) {
      // Update existing preview
      const updated = await this.prisma.generatedItinerary.update({
        where: { id: existing.id },
        data: {
          title: previewData.title || `Trip to ${previewData.destination || context.destination || 'Unknown'}`,
          destination: previewData.destination || context.destination || 'Unknown',
          duration_days: previewData.duration_days || previewData.days?.length || 1,
          travel_style: previewData.travel_style || null,
          budget: previewData.budget_estimate || null,
          preview_data: previewData,
          enriched_data: Prisma.DbNull, // Reset enriched data
          status: ItineraryStatus.preview,
        },
      });
      return updated;
    }

    return this.prisma.generatedItinerary.create({
      data: {
        session_id: sessionId,
        user_id: userId,
        title: previewData.title || `Trip to ${previewData.destination || context.destination || 'Unknown'}`,
        destination: previewData.destination || context.destination || 'Unknown',
        duration_days: previewData.duration_days || previewData.days?.length || 1,
        travel_style: previewData.travel_style || null,
        budget: previewData.budget_estimate || null,
        preview_data: previewData,
        status: ItineraryStatus.preview,
      },
    });
  }
}
