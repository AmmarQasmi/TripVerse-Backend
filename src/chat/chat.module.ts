import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { WeatherModule } from '../weather/weather.module';
import { ItineraryModule } from '../itineraries/itinerary.module';
import { ChatController } from './chat.controller';
import {
  ChatService,
  GeminiService,
  ItineraryAgentService,
  PersonalAssistantService,
  EnrichmentService,
  PlacesService,
  WikipediaService,
} from './services';
import { RolesGuard } from '../common/guards/roles.guard';
import { ChatRateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [AuthModule, WeatherModule, ConfigModule, forwardRef(() => ItineraryModule)],
  controllers: [ChatController],
  providers: [
    ChatService,
    GeminiService,
    ItineraryAgentService,
    PersonalAssistantService,
    EnrichmentService,
    PlacesService,
    WikipediaService,
    RolesGuard,
    ChatRateLimitGuard,
  ],
  exports: [ChatService, EnrichmentService, PlacesService, WikipediaService],
})
export class ChatModule {}
