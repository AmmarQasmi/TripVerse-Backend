import { Module } from '@nestjs/common';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModule } from '../admin/admin.module';
import { GooglePlacesService } from '../common/services/google-places.service';

@Module({
	imports: [AuthModule, CloudinaryModule, NotificationsModule, AdminModule],
	controllers: [CarsController],
	providers: [CarsService, RolesGuard, GooglePlacesService],
	exports: [CarsService],
})
export class CarsModule {}