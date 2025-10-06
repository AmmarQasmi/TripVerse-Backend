import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HotelsModule } from './hotels/hotels.module';
import { CarsModule } from './cars/cars.module';
import { DriversModule } from './drivers/drivers.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { MonumentsModule } from './monuments/monuments.module';
import { WeatherModule } from './weather/weather.module';
import { AdminModule } from './admin/admin.module';

@Module({
	imports: [
		PrismaModule,
		AuthModule,
		UsersModule,
		HotelsModule,
		CarsModule,
		DriversModule,
		BookingsModule,
		PaymentsModule,
		MonumentsModule,
		WeatherModule,
		AdminModule,
	],
})
export class AppModule {}


