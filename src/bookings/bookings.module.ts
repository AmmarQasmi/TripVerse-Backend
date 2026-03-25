import { Module } from '@nestjs/common';
import { HotelBookingsController } from './hotel-bookings.controller';
import { CarBookingsController } from './car-bookings.controller';
import { BookingsService } from './bookings.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
	imports: [AuthModule, NotificationsModule, PrismaModule, PaymentsModule],
	controllers: [HotelBookingsController, CarBookingsController],
	providers: [BookingsService, RolesGuard],
	exports: [BookingsService],
})
export class BookingsModule {}


