import { Module } from '@nestjs/common';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';

@Module({
	imports: [AuthModule, CloudinaryModule],
	controllers: [CarsController],
	providers: [CarsService, RolesGuard],
	exports: [CarsService],
})
export class CarsModule {}