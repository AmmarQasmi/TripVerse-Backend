import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { ItineraryController } from './itinerary.controller';
import { ItineraryService } from './itinerary.service';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [AuthModule, forwardRef(() => ChatModule)],
  controllers: [ItineraryController],
  providers: [
    ItineraryService,
    RolesGuard,
  ],
  exports: [ItineraryService],
})
export class ItineraryModule {}
