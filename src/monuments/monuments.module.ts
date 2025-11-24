import { Module } from '@nestjs/common';
import { MonumentsController } from './monuments.controller';
import { MonumentsService } from './monuments.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';
import { GoogleVisionService } from '../common/services/google-vision.service';
import { WikipediaService } from '../common/services/wikipedia.service';
import { GooglePlacesService } from '../common/services/google-places.service';
import { ExportService } from '../common/services/export.service';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [MonumentsController],
  providers: [
    MonumentsService,
    GoogleVisionService,
    WikipediaService,
    GooglePlacesService,
    ExportService,
  ],
  exports: [MonumentsService],
})
export class MonumentsModule {}


