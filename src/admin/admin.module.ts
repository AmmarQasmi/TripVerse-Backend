import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { DriversModule } from '../drivers/drivers.module';
import { HotelManagersModule } from '../hotel-managers/hotel-managers.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
	imports: [DriversModule, HotelManagersModule, NotificationsModule],
	controllers: [AdminController],
	providers: [AdminService, ScheduledJobsService],
	exports: [AdminService], // Export for use in CarsModule
})
export class AdminModule {}


