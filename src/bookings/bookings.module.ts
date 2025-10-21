import { Module } from '@nestjs/common';
import { HotelBookingsController } from './hotel-bookings.controller';
import { CarBookingsController } from './car-bookings.controller';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [AuthModule],
	controllers: [HotelBookingsController, CarBookingsController],
	providers: [BookingsService, PrismaService, RolesGuard],
	exports: [BookingsService],
})
export class BookingsModule {}


