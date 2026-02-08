import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { ChatGateway } from './chat.gateway';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModule } from '../admin/admin.module';
import { GooglePlacesService } from '../common/services/google-places.service';
import { WeatherService } from '../weather/weather.service';
import { JwtModule } from '@nestjs/jwt';

@Module({
	imports: [
		AuthModule,
		CloudinaryModule,
		NotificationsModule,
		AdminModule,
		ConfigModule,
		JwtModule.register({
			secret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
		}),
	],
	controllers: [CarsController],
	providers: [CarsService, ChatGateway, RolesGuard, GooglePlacesService, WeatherService],
	exports: [CarsService, ChatGateway],
})
export class CarsModule {}