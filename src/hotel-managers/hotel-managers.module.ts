import { Module } from '@nestjs/common';
import { HotelManagersController } from './hotel-managers.controller';
import { HotelManagersService } from './hotel-managers.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
	imports: [NotificationsModule],
	controllers: [HotelManagersController],
	providers: [HotelManagersService],
	exports: [HotelManagersService],
})
export class HotelManagersModule {}

