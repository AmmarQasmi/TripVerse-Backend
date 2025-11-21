import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private configService: ConfigService) {
    const cloudName = this.configService.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get('CLOUDINARY_API_SECRET');

    // Validate Cloudinary credentials
    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.warn('Cloudinary credentials not configured. Image uploads will fail.');
    } else {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      this.logger.log('Cloudinary configured successfully');
    }
  }

  /**
   * Upload single image to Cloudinary
   */
  async uploadImage(
    file: any,
    folder: string,
    options?: {
      transformation?: any[];
      public_id?: string;
      overwrite?: boolean;
    }
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Invalid file: file buffer is required');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `tripverse/${folder}`,
          resource_type: 'auto',
          ...options,
        },
        (error: any, result: any) => {
          if (error) {
            this.logger.error('Cloudinary upload error:', error);
            const errorMessage = error.message || 'Failed to upload image';
            reject(new BadRequestException(`Cloudinary upload failed: ${errorMessage}`));
          } else {
            this.logger.log(`Image uploaded successfully: ${result.public_id}`);
            resolve(result);
          }
        }
      );

      uploadStream.end(file.buffer);
    });
  }

  /**
   * Upload multiple images to Cloudinary
   */
  async uploadMultipleImages(
    files: any[],
    folder: string,
    options?: any
  ) {
    const uploadPromises = files.map(file => 
      this.uploadImage(file, folder, options)
    );
    return Promise.all(uploadPromises);
  }

  /**
   * Upload document (PDF, DOCX, etc.) to Cloudinary
   */
  async uploadDocument(
    file: any,
    folder: string,
    options?: {
      public_id?: string;
      overwrite?: boolean;
    }
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Invalid file: file buffer is required');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `tripverse/${folder}`,
          resource_type: 'raw',
          ...options,
        },
        (error: any, result: any) => {
          if (error) {
            this.logger.error('Cloudinary document upload error:', error);
            const errorMessage = error.message || 'Failed to upload document';
            reject(new BadRequestException(`Cloudinary upload failed: ${errorMessage}`));
          } else {
            this.logger.log(`Document uploaded successfully: ${result.public_id}`);
            resolve(result);
          }
        }
      );

      uploadStream.end(file.buffer);
    });
  }

  /**
   * Upload raw file (for exports, etc.) to Cloudinary
   */
  async uploadRawFile(
    buffer: Buffer,
    fileName: string,
    folder: string,
    options?: {
      public_id?: string;
      overwrite?: boolean;
    }
  ) {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Invalid file: buffer is required');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `tripverse/${folder}`,
          resource_type: 'raw',
          public_id: options?.public_id || fileName,
          ...options,
        },
        (error: any, result: any) => {
          if (error) {
            this.logger.error('Cloudinary raw file upload error:', error);
            const errorMessage = error.message || 'Failed to upload file';
            reject(new BadRequestException(`Cloudinary upload failed: ${errorMessage}`));
          } else {
            this.logger.log(`Raw file uploaded successfully: ${result.public_id}`);
            resolve(result);
          }
        }
      );

      uploadStream.end(buffer);
    });
  }

  /**
   * Delete image from Cloudinary
   */
  async deleteImage(publicId: string) {
    if (!publicId) {
      throw new BadRequestException('Public ID is required');
    }

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      if (result.result === 'ok') {
        this.logger.log(`Image deleted successfully: ${publicId}`);
      } else {
        this.logger.warn(`Image deletion result: ${result.result} for ${publicId}`);
      }
      return result;
    } catch (error) {
      this.logger.error('Cloudinary delete error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete image';
      throw new BadRequestException(`Failed to delete image: ${errorMessage}`);
    }
  }

  /**
   * Delete multiple images from Cloudinary
   */
  async deleteMultipleImages(publicIds: string[]) {
    if (!publicIds || publicIds.length === 0) {
      throw new BadRequestException('Public IDs array is required');
    }

    try {
      const result = await cloudinary.api.delete_resources(publicIds);
      this.logger.log(`Bulk delete completed: ${publicIds.length} images`);
      return result;
    } catch (error) {
      this.logger.error('Cloudinary bulk delete error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete images';
      throw new BadRequestException(`Failed to delete images: ${errorMessage}`);
    }
  }

  /**
   * Generate optimized URL for different use cases
   */
  generateOptimizedUrl(publicId: string, options: {
    width?: number;
    height?: number;
    quality?: string;
    format?: string;
    crop?: string;
  } = {}) {
    return cloudinary.url(publicId, {
      ...options,
      secure: true,
    });
  }

  /**
   * Generate responsive image URLs
   */
  generateResponsiveUrls(publicId: string) {
    return {
      thumbnail: this.generateOptimizedUrl(publicId, {
        width: 300,
        height: 200,
        crop: 'fill',
        quality: 'auto',
        format: 'auto'
      }),
      medium: this.generateOptimizedUrl(publicId, {
        width: 800,
        height: 600,
        crop: 'fill',
        quality: 'auto',
        format: 'auto'
      }),
      large: this.generateOptimizedUrl(publicId, {
        width: 1200,
        height: 800,
        crop: 'fill',
        quality: 'auto',
        format: 'auto'
      }),
      original: this.generateOptimizedUrl(publicId, {
        quality: 'auto',
        format: 'auto'
      })
    };
  }

  /**
   * Extract public ID from Cloudinary URL
   * Supports multiple URL formats:
   * - https://res.cloudinary.com/cloud_name/image/upload/v1234567/folder/image.jpg
   * - https://res.cloudinary.com/cloud_name/image/upload/v1234567/folder/image
   * - https://res.cloudinary.com/cloud_name/raw/upload/v1234567/folder/file.pdf
   */
  extractPublicId(url: string): string | null {
    if (!url || typeof url !== 'string') {
      return null;
    }

    try {
      // Pattern 1: Standard image URL with extension
      let matches = url.match(/\/v\d+\/(.+)\.(jpg|jpeg|png|gif|webp|pdf|docx?)$/i);
      if (matches) {
        return matches[1];
      }

      // Pattern 2: URL without extension (for transformed images)
      matches = url.match(/\/v\d+\/(.+)$/i);
      if (matches) {
        // Remove any transformation parameters
        const publicId = matches[1].split('/').pop()?.split('?')[0];
        if (publicId) {
          return publicId.includes('/') ? matches[1].split('?')[0] : publicId;
        }
      }

      // Pattern 3: Direct public_id in URL path
      matches = url.match(/\/image\/upload\/(?:.+\/)?(.+?)(?:\?|$)/i);
      if (matches) {
        return matches[1];
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to extract public_id from URL: ${url}`, error);
      return null;
    }
  }
}
