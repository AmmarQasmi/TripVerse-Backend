import {
	Controller,
	Post,
	Delete,
	Param,
	UseGuards,
	UseInterceptors,
	UploadedFile,
	UploadedFiles,
	BadRequestException,
	Body,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { JwtAuthGuard } from '../guards/auth.guard';
import { imageUploadConfig, multerConfig } from '../config/multer.config';

@Controller('upload')
export class UploadController {
	constructor(private readonly cloudinaryService: CloudinaryService) {}

	/**
	 * Upload single image to a specific folder
	 * POST /upload/images/:folder
	 * Body: FormData with 'image' field
	 */
	@Post('images/:folder')
	@UseGuards(JwtAuthGuard)
	@UseInterceptors(FileInterceptor('image', imageUploadConfig))
	async uploadImage(
		@Param('folder') folder: string,
		@UploadedFile() file: Express.Multer.File,
	) {
		if (!file) {
			throw new BadRequestException('No image file uploaded or invalid file type');
		}

		try {
			const result: any = await this.cloudinaryService.uploadImage(file, folder);
			return {
				url: result.secure_url,
				public_id: result.public_id,
			};
		} catch (error: any) {
			throw new BadRequestException(
				error.message || 'Failed to upload image',
			);
		}
	}

	/**
	 * Upload multiple images to a specific folder
	 * POST /upload/images/:folder/multiple
	 * Body: FormData with 'images' field (array)
	 */
	@Post('images/:folder/multiple')
	@UseGuards(JwtAuthGuard)
	@UseInterceptors(FilesInterceptor('images', 10, imageUploadConfig))
	async uploadMultipleImages(
		@Param('folder') folder: string,
		@UploadedFiles() files: Express.Multer.File[],
	) {
		if (!files || files.length === 0) {
			throw new BadRequestException('No image files uploaded');
		}

		try {
			const results = await this.cloudinaryService.uploadMultipleImages(
				files,
				folder,
			);
			return {
				message: 'Images uploaded successfully',
				images: results.map((result: any) => ({
					url: result.secure_url,
					public_id: result.public_id,
				})),
			};
		} catch (error: any) {
			throw new BadRequestException(
				error.message || 'Failed to upload images',
			);
		}
	}

	/**
	 * Delete image by public ID
	 * DELETE /upload/images/:publicId
	 */
	@Delete('images/:publicId')
	@UseGuards(JwtAuthGuard)
	async deleteImage(@Param('publicId') publicId: string) {
		try {
			await this.cloudinaryService.deleteImage(publicId);
			return { message: 'Image deleted successfully' };
		} catch (error: any) {
			throw new BadRequestException(
				error.message || 'Failed to delete image',
			);
		}
	}
}

