import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { DisputeRuleEngineService } from './dispute-rule-engine.service';
import { DriversModule } from '../drivers/drivers.module';
import { HotelManagersModule } from '../hotel-managers/hotel-managers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
	imports: [DriversModule, HotelManagersModule, NotificationsModule, ChatModule, CloudinaryModule, PaymentsModule],
	controllers: [AdminController],
	providers: [AdminService, ScheduledJobsService, DisputeRuleEngineService],
	exports: [AdminService],
})
export class AdminModule {}


