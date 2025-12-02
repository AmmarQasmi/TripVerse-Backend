import { Module } from '@nestjs/common';
import { FlightsController } from './flights.controller';
import { FlightsService } from './flights.service';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [AuthModule],
	controllers: [FlightsController],
	providers: [FlightsService],
	exports: [FlightsService],
})
export class FlightsModule {}

