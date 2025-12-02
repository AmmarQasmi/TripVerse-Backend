import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CitiesModule } from './cities/cities.module';
import { HotelsModule } from './hotels/hotels.module';
import { CarsModule } from './cars/cars.module';
import { DriversModule } from './drivers/drivers.module';
import { HotelManagersModule } from './hotel-managers/hotel-managers.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { MonumentsModule } from './monuments/monuments.module';
import { WeatherModule } from './weather/weather.module';
import { FlightsModule } from './flights/flights.module';
import { AdminModule } from './admin/admin.module';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';
import { UploadModule } from './common/upload/upload.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: '.env',
		}),
		ScheduleModule.forRoot(),
		PrismaModule,
		CloudinaryModule,
		AuthModule,
		UsersModule,
		CitiesModule,
		HotelsModule,
		CarsModule,
		DriversModule,
		HotelManagersModule,
		BookingsModule,
		PaymentsModule,
		MonumentsModule,
		WeatherModule,
		FlightsModule,
		AdminModule,
		UploadModule,
		NotificationsModule,
	],
})
export class AppModule {}


