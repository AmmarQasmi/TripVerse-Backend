import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { GoogleVisionService, LandmarkDetectionResult } from '../common/services/google-vision.service';
import { WikipediaService, WikipediaResult } from '../common/services/wikipedia.service';
import { LobstrService, LobstrResult } from '../common/services/lobstr.service';
import { MonumentRecognition } from '@prisma/client';

export interface PlaceResult {
  place_id?: string;
  name: string;
  formatted_address: string;
  rating?: number;
  user_ratings_total?: number;
  reviews?: Array<{
    author_name: string;
    author_url?: string;
    rating: number;
    text: string;
    time: number;
    relative_time_description?: string;
  }>;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
  website?: string;
  international_phone_number?: string;
  opening_hours?: {
    open_now: boolean;
    weekday_text: string[];
  };
}

export interface MonumentRecognitionResult {
  id: number;
  name: string;
  confidence: number;
  imageUrl: string;
  wikiSnippet?: string;
  wikipediaUrl?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  placeDetails?: PlaceResult;
  rawData?: any;
  createdAt: Date;
}

export interface ExportResult {
  id: number;
  monumentId: number;
  format: string;
  fileUrl: string;
  fileSize?: number;
  createdAt: Date;
}

@Injectable()
export class MonumentsService {
  private readonly logger = new Logger(MonumentsService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private googleVisionService: GoogleVisionService,
    private wikipediaService: WikipediaService,
    private lobstrService: LobstrService,
  ) {}

  /**
   * Upload image and recognize monument
   */
  async recognizeMonument(
    userId: number,
    imageBuffer: Buffer,
    originalName: string,
  ): Promise<MonumentRecognitionResult> {
    try {
      this.logger.log(`Starting monument recognition for user ${userId}`);

      // Upload image to Cloudinary
      const uploadResult = await this.cloudinaryService.uploadImage(
        { buffer: imageBuffer, originalname: originalName },
        'monuments',
        {
          transformation: [
            { width: 1200, height: 800, crop: 'limit', quality: 'auto' }
          ]
        }
      );

      const imageUrl = (uploadResult as any).secure_url;

      // Detect landmarks using Google Vision
      let landmarks: LandmarkDetectionResult[] = [];
      try {
        landmarks = await this.googleVisionService.detectLandmarks(imageBuffer);
      } catch (error: any) {
        this.logger.error('Google Vision API error:', error);
        
        // Check if it's a billing/permission error
        if (error?.message?.includes('PERMISSION_DENIED') || error?.message?.includes('billing')) {
          throw new BadRequestException(
            'Google Vision API requires billing to be enabled. Please enable billing on your Google Cloud project and try again.'
          );
        }
        
        // Check if it's a no landmarks detected error
        if (error?.message?.includes('No monuments') || error?.message?.includes('landmarks detected')) {
          throw error; // Re-throw the original error
        }
        
        // Generic error
        throw new BadRequestException('Failed to detect landmarks in image. Please ensure Google Vision API is properly configured.');
      }
      
      if (landmarks.length === 0) {
        throw new BadRequestException('No monuments or landmarks detected in the image');
      }

      // Get the landmark with highest confidence
      const bestLandmark = landmarks.reduce((prev, current) => 
        current.confidence > prev.confidence ? current : prev
      );

      this.logger.log(`Detected landmark: ${bestLandmark.name} (confidence: ${bestLandmark.confidence})`);

      // Enrich with Wikipedia data
      let wikipediaData: WikipediaResult | null = null;
      try {
        wikipediaData = await this.wikipediaService.searchMonument(bestLandmark.name);
      } catch (error) {
        this.logger.warn('Wikipedia enrichment failed:', (error as Error).message);
      }

      // Submit async job to Lobstr.io for review scraping if location is available
      let lobstrRunHash: string | null = null;
      if (bestLandmark.location) {
        try {
          // Automatically get or create squid for Google Reviews
          const squidId = await this.lobstrService.getOrCreateSquid();
          if (squidId) {
            lobstrRunHash = await this.lobstrService.scrapePlaceReviews(
              bestLandmark.name,
              undefined, // placeId not available from Vision API
              squidId
            );
            if (lobstrRunHash) {
              this.logger.log(`Submitted Lobstr.io review scraping job: ${lobstrRunHash}`);
            }
          } else {
            this.logger.warn('Failed to get/create Lobstr.io squid, skipping review scraping');
          }
        } catch (error) {
          this.logger.warn('Lobstr.io review scraping submission failed:', (error as Error).message);
        }
      }

      // Save recognition result to database
      const recognition = await this.prisma.monumentRecognition.create({
        data: {
          user_id: userId,
          image_url: imageUrl,
          name: bestLandmark.name,
          confidence: bestLandmark.confidence,
          wiki_snippet: wikipediaData?.extract,
          raw_payload_json: {
            landmarks: landmarks as any,
            wikipedia: wikipediaData as any,
            lobstr: {
              runHash: lobstrRunHash,
              status: lobstrRunHash ? 'pending' : null,
            },
            vision: {
              location: bestLandmark.location,
              boundingPoly: bestLandmark.boundingPoly,
            },
          } as any,
        },
      });

      this.logger.log(`Monument recognition completed: ${recognition.id}`);

      return {
        id: recognition.id,
        name: recognition.name,
        confidence: Number(recognition.confidence),
        imageUrl: recognition.image_url,
        wikiSnippet: recognition.wiki_snippet || undefined,
        wikipediaUrl: wikipediaData?.url,
        coordinates: bestLandmark.location,
        placeDetails: undefined, // Will be fetched later via getMonumentReviews
        rawData: recognition.raw_payload_json,
        createdAt: recognition.created_at,
      };

    } catch (error) {
      this.logger.error('Monument recognition failed:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to recognize monument in image');
    }
  }

  /**
   * Get user's monument recognitions
   */
  async getUserRecognitions(userId: number, page: number = 1, limit: number = 10): Promise<{
    recognitions: MonumentRecognitionResult[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;

    const [recognitions, total] = await Promise.all([
      this.prisma.monumentRecognition.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.monumentRecognition.count({
        where: { user_id: userId },
      }),
    ]);

    const results: MonumentRecognitionResult[] = recognitions.map(rec => ({
      id: rec.id,
      name: rec.name,
      confidence: Number(rec.confidence),
      imageUrl: rec.image_url,
      wikiSnippet: rec.wiki_snippet || undefined,
      wikipediaUrl: (rec.raw_payload_json as any)?.wikipedia?.url,
      coordinates: (rec.raw_payload_json as any)?.vision?.location,
      placeDetails: (rec.raw_payload_json as any)?.placeDetails,
      rawData: rec.raw_payload_json,
      createdAt: rec.created_at,
    }));

    return {
      recognitions: results,
      total,
      page,
      limit,
    };
  }

  /**
   * Get specific monument recognition
   */
  async getRecognition(userId: number, recognitionId: number): Promise<MonumentRecognitionResult> {
    const recognition = await this.prisma.monumentRecognition.findFirst({
      where: {
        id: recognitionId,
        user_id: userId,
      },
    });

    if (!recognition) {
      throw new NotFoundException('Monument recognition not found');
    }

    return {
      id: recognition.id,
      name: recognition.name,
      confidence: Number(recognition.confidence),
      imageUrl: recognition.image_url,
      wikiSnippet: recognition.wiki_snippet || undefined,
      wikipediaUrl: (recognition.raw_payload_json as any)?.wikipedia?.url,
      coordinates: (recognition.raw_payload_json as any)?.vision?.location,
      placeDetails: (recognition.raw_payload_json as any)?.placeDetails,
      rawData: recognition.raw_payload_json,
      createdAt: recognition.created_at,
    };
  }

  /**
   * Get monument reviews from Lobstr.io (async polling)
   */
  async getMonumentReviews(userId: number, recognitionId: number): Promise<{
    reviews?: PlaceResult['reviews'];
    rating?: number;
    user_ratings_total?: number;
    formatted_address?: string;
    status: 'pending' | 'completed' | 'failed' | 'not_started';
  }> {
    const recognition = await this.prisma.monumentRecognition.findFirst({
      where: {
        id: recognitionId,
        user_id: userId,
      },
    });

    if (!recognition) {
      throw new NotFoundException('Monument recognition not found');
    }

    const rawData = recognition.raw_payload_json as any;
    const lobstrData = rawData?.lobstr;

    // If no Lobstr run hash, reviews were never requested
    if (!lobstrData?.runHash) {
      return {
        status: 'not_started',
      };
    }

    // Check if reviews are already fetched and stored
    if (rawData?.placeDetails && rawData.placeDetails.reviews) {
      return {
        reviews: rawData.placeDetails.reviews,
        rating: rawData.placeDetails.rating,
        user_ratings_total: rawData.placeDetails.user_ratings_total,
        formatted_address: rawData.placeDetails.formatted_address,
        status: 'completed',
      };
    }

    // Poll Lobstr.io for run status
    try {
      const runStatus = await this.lobstrService.checkRunStatus(lobstrData.runHash);
      
      if (!runStatus) {
        return {
          status: 'failed',
        };
      }

      if (runStatus.status === 'pending' || runStatus.status === 'running') {
        return {
          status: 'pending',
        };
      }

      if (runStatus.status === 'failed') {
        // Update status in database
        await this.prisma.monumentRecognition.update({
          where: { id: recognitionId },
          data: {
            raw_payload_json: {
              ...rawData,
              lobstr: {
                ...lobstrData,
                status: 'failed',
              },
            } as any,
          },
        });
        return {
          status: 'failed',
        };
      }

      if (runStatus.status === 'completed') {
        // Fetch results
        const results = await this.lobstrService.getRunResults(lobstrData.runHash);
        
        if (!results || results.length === 0) {
          return {
            status: 'failed',
          };
        }

        // Get the first result (should be the monument we searched for)
        const lobstrResult = results[0];
        
        // Transform to PlaceResult format
        const placeDetails: PlaceResult = {
          name: lobstrResult.name,
          formatted_address: lobstrResult.formatted_address,
          rating: lobstrResult.rating,
          user_ratings_total: lobstrResult.user_ratings_total,
          reviews: lobstrResult.reviews?.map(review => ({
            author_name: review.author_name,
            author_url: review.author_url,
            rating: review.rating,
            text: review.text,
            time: review.time,
            relative_time_description: review.relative_time_description,
          })),
          geometry: lobstrResult.geometry,
        };

        // Update database with fetched reviews
        await this.prisma.monumentRecognition.update({
          where: { id: recognitionId },
          data: {
            raw_payload_json: {
              ...rawData,
              placeDetails: placeDetails,
              lobstr: {
                ...lobstrData,
                status: 'completed',
              },
            } as any,
          },
        });

        return {
          reviews: placeDetails.reviews,
          rating: placeDetails.rating,
          user_ratings_total: placeDetails.user_ratings_total,
          formatted_address: placeDetails.formatted_address,
          status: 'completed',
        };
      }

      return {
        status: 'pending',
      };
    } catch (error) {
      this.logger.error('Error fetching monument reviews:', error);
      return {
        status: 'failed',
      };
    }
  }

  /**
   * Delete monument recognition
   */
  async deleteRecognition(userId: number, recognitionId: number): Promise<void> {
    const recognition = await this.prisma.monumentRecognition.findFirst({
      where: {
        id: recognitionId,
        user_id: userId,
      },
    });

    if (!recognition) {
      throw new NotFoundException('Monument recognition not found');
    }

    // Delete from Cloudinary
    try {
      const publicId = this.cloudinaryService.extractPublicId(recognition.image_url);
      if (publicId) {
        await this.cloudinaryService.deleteImage(publicId);
      }
    } catch (error) {
      this.logger.warn('Failed to delete image from Cloudinary:', (error as Error).message);
    }

    // Delete from database
    await this.prisma.monumentRecognition.delete({
      where: { id: recognitionId },
    });

    this.logger.log(`Deleted monument recognition: ${recognitionId}`);
  }

  /**
   * Log monument export
   */
  async logExport(
    userId: number,
    monumentId: number,
    format: string,
    fileUrl: string,
    fileSize: number,
  ): Promise<ExportResult> {
    const exportLog = await (this.prisma as any).monumentExportLog.create({
      data: {
        user_id: userId,
        monument_id: monumentId,
        format,
        file_url: fileUrl,
        file_size: fileSize,
      },
    });

    return {
      id: exportLog.id,
      monumentId: exportLog.monument_id,
      format: exportLog.format,
      fileUrl: exportLog.file_url,
      fileSize: exportLog.file_size,
      createdAt: exportLog.created_at,
    };
  }

  /**
   * Get user's export history
   */
  async getUserExports(userId: number, page: number = 1, limit: number = 10): Promise<{
    exports: ExportResult[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;

    const [exports, total] = await Promise.all([
      (this.prisma as any).monumentExportLog.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          monument: {
            select: {
              name: true,
              image_url: true,
            },
          },
        },
      }),
      (this.prisma as any).monumentExportLog.count({
        where: { user_id: userId },
      }),
    ]);

    const results: ExportResult[] = exports.map((exp: any) => ({
      id: exp.id,
      monumentId: exp.monument_id,
      format: exp.format,
      fileUrl: exp.file_url,
      fileSize: exp.file_size,
      createdAt: exp.created_at,
    }));

    return {
      exports: results,
      total,
      page,
      limit,
    };
  }

  /**
   * Get export statistics for user
   */
  async getExportStats(userId: number): Promise<{
    totalExports: number;
    pdfExports: number;
    docxExports: number;
    totalFileSize: number;
    lastExportDate?: Date;
  }> {
    const [totalExports, pdfExports, docxExports, lastExport, fileSizeStats] = await Promise.all([
      (this.prisma as any).monumentExportLog.count({
        where: { user_id: userId },
      }),
      (this.prisma as any).monumentExportLog.count({
        where: { user_id: userId, format: 'pdf' },
      }),
      (this.prisma as any).monumentExportLog.count({
        where: { user_id: userId, format: 'docx' },
      }),
      (this.prisma as any).monumentExportLog.findFirst({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
      }),
      (this.prisma as any).monumentExportLog.aggregate({
        where: { user_id: userId },
        _sum: { file_size: true },
      }),
    ]);

    return {
      totalExports,
      pdfExports,
      docxExports,
      totalFileSize: fileSizeStats._sum.file_size || 0,
      lastExportDate: lastExport?.created_at,
    };
  }
}


