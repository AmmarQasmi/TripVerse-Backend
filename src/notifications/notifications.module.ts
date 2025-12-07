import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsService as CommonNotificationsService } from '../common/services/notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
	imports: [
		PrismaModule,
		JwtModule.register({
			secret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
		}),
	],
	controllers: [NotificationsController],
	providers: [
		NotificationsService,
		CommonNotificationsService,
		NotificationsGateway,
	],
	exports: [CommonNotificationsService, NotificationsGateway], // Export for use in other modules
})
export class NotificationsModule {}

