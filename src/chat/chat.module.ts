import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WeatherModule } from '../weather/weather.module';
import { ChatController } from './chat.controller';
import {
  ChatService,
  GeminiService,
  StateMachineService,
  ItineraryAgentService,
  PersonalAssistantService,
} from './services';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [AuthModule, WeatherModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    GeminiService,
    StateMachineService,
    ItineraryAgentService,
    PersonalAssistantService,
    RolesGuard,
  ],
  exports: [ChatService],
})
export class ChatModule {}
