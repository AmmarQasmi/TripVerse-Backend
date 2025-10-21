import { Module } from '@nestjs/common';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';

@Module({
	imports: [AuthModule, CloudinaryModule],
	controllers: [HotelsController],
	providers: [HotelsService, RolesGuard],
})
export class HotelsModule {}


