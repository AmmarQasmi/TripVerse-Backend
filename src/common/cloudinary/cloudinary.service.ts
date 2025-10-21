import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
    });
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
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `tripverse/${folder}`,
          resource_type: 'auto',
          ...options,
        },
        (error: any, result: any) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(new BadRequestException('Failed to upload image'));
          } else {
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
   * Delete image from Cloudinary
   */
  async deleteImage(publicId: string) {
    try {
      return await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw new BadRequestException('Failed to delete image');
    }
  }

  /**
   * Delete multiple images from Cloudinary
   */
  async deleteMultipleImages(publicIds: string[]) {
    try {
      return await cloudinary.api.delete_resources(publicIds);
    } catch (error) {
      console.error('Cloudinary bulk delete error:', error);
      throw new BadRequestException('Failed to delete images');
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
   */
  extractPublicId(url: string): string | null {
    try {
      const matches = url.match(/\/v\d+\/(.+)\.(jpg|jpeg|png|gif|webp)$/i);
      return matches ? matches[1] : null;
    } catch (error) {
      return null;
    }
  }
}
