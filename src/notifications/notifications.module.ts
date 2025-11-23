import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsService as CommonNotificationsService } from '../common/services/notifications.service';

@Module({
	controllers: [NotificationsController],
	providers: [
		NotificationsService,
		CommonNotificationsService,
	],
	exports: [CommonNotificationsService], // Export for use in other modules
})
export class NotificationsModule {}

