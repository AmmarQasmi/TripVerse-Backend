import { 
  Controller, 
  Get, 
  Post, 
  Delete, 
  Param, 
  Query, 
  UseInterceptors, 
  UploadedFile, 
  BadRequestException,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MonumentsService, MonumentRecognitionResult } from './monuments.service';
import { ExportService } from '../common/services/export.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { successResponse } from '../common/utils/response.util';
import { FILE_LIMITS } from '../common/utils/constants';

@Controller('monuments')
@UseGuards(JwtAuthGuard)
export class MonumentsController {
  constructor(
    private readonly monumentsService: MonumentsService,
    private readonly exportService: ExportService,
  ) {}

  @Get('health')
  health() {
    return { ok: true, service: 'monuments' };
  }

  /**
   * Upload image and recognize monument
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('image', {
    limits: {
      fileSize: FILE_LIMITS.MAX_SIZE,
    },
    fileFilter: (req, file, callback) => {
      if (FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        callback(null, true);
      } else {
        callback(new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
      }
    },
  }))
  async uploadMonument(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<MonumentRecognitionResult> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    return await this.monumentsService.recognizeMonument(
      user.id,
      file.buffer,
      file.originalname,
    );
  }

  /**
   * Get user's monument recognitions
   */
  @Get('my-recognitions')
  async getMyRecognitions(
    @CurrentUser() user: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;

    return await this.monumentsService.getUserRecognitions(
      user.id,
      pageNum,
      limitNum,
    );
  }

  /**
   * Get specific monument recognition
   */
  @Get(':id')
  async getRecognition(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<MonumentRecognitionResult> {
    return await this.monumentsService.getRecognition(user.id, id);
  }

  /**
   * Delete monument recognition
   */
  @Delete(':id')
  async deleteRecognition(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.monumentsService.deleteRecognition(user.id, id);
    return successResponse(null, 'Monument recognition deleted successfully');
  }

  /**
   * Export monument recognition as PDF
   */
  @Post(':id/export/pdf')
  async exportPDF(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    const recognition = await this.monumentsService.getRecognition(user.id, id);
    
    // Generate PDF
    const pdfBuffer = await this.exportService.generatePDF(recognition);
    
    // Upload to Cloudinary
    const uploadResult = await this.exportService.uploadExportFile(
      pdfBuffer,
      'pdf',
      recognition.name,
    );

    // Save export log
    const exportLog = await this.monumentsService.logExport(
      user.id,
      id,
      'pdf',
      uploadResult.url,
      pdfBuffer.length,
    );

    return successResponse({
      exportId: exportLog.id,
      downloadUrl: uploadResult.url,
      format: 'pdf',
      fileSize: pdfBuffer.length,
    }, 'PDF export generated successfully');
  }

  /**
   * Export monument recognition as DOCX
   */
  @Post(':id/export/docx')
  async exportDOCX(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    const recognition = await this.monumentsService.getRecognition(user.id, id);
    
    // Generate DOCX
    const docxBuffer = await this.exportService.generateDOCX(recognition);
    
    // Upload to Cloudinary
    const uploadResult = await this.exportService.uploadExportFile(
      docxBuffer,
      'docx',
      recognition.name,
    );

    // Save export log
    const exportLog = await this.monumentsService.logExport(
      user.id,
      id,
      'docx',
      uploadResult.url,
      docxBuffer.length,
    );

    return successResponse({
      exportId: exportLog.id,
      downloadUrl: uploadResult.url,
      format: 'docx',
      fileSize: docxBuffer.length,
    }, 'DOCX export generated successfully');
  }

  /**
   * Get user's export history
   */
  @Get('exports/history')
  async getExportHistory(
    @CurrentUser() user: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;

    return await this.monumentsService.getUserExports(
      user.id,
      pageNum,
      limitNum,
    );
  }
}


