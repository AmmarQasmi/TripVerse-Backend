import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient } from '@google-cloud/vision';

export interface LandmarkDetectionResult {
  name: string;
  confidence: number;
  location?: {
    lat: number;
    lng: number;
  };
  boundingPoly?: any;
}

@Injectable()
export class GoogleVisionService {
  private readonly logger = new Logger(GoogleVisionService.name);
  private client: ImageAnnotatorClient;

  constructor(private configService: ConfigService) {
    // Initialize Google Vision client
    this.client = new ImageAnnotatorClient({
      credentials: {
        client_email: this.configService.get('GOOGLE_VISION_CLIENT_EMAIL'),
        private_key: this.configService.get('GOOGLE_VISION_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
      },
      projectId: this.configService.get('GOOGLE_VISION_PROJECT_ID'),
    });
  }

  /**
   * Detect landmarks in an image using Google Vision API
   */
  async detectLandmarks(imageBuffer: Buffer): Promise<LandmarkDetectionResult[]> {
    try {
      this.logger.log('Starting landmark detection...');

      const [result] = await this.client.landmarkDetection({
        image: {
          content: imageBuffer,
        },
        imageContext: {
          languageHints: ['en'], // English language hints
        },
      });

      const landmarks: LandmarkDetectionResult[] = [];

      if (result.landmarkAnnotations && result.landmarkAnnotations.length > 0) {
        for (const annotation of result.landmarkAnnotations) {
          if (annotation.description && annotation.score) {
            const landmark: LandmarkDetectionResult = {
              name: annotation.description,
              confidence: annotation.score,
            };

            // Add location if available
            if (annotation.locations && annotation.locations.length > 0) {
              const location = annotation.locations[0].latLng;
              if (location) {
                landmark.location = {
                  lat: location.latitude || 0,
                  lng: location.longitude || 0,
                };
              }
            }

            // Add bounding poly if available
            if (annotation.boundingPoly) {
              landmark.boundingPoly = annotation.boundingPoly;
            }

            landmarks.push(landmark);
          }
        }
      }

      this.logger.log(`Detected ${landmarks.length} landmarks`);
      return landmarks;

    } catch (error) {
      this.logger.error('Google Vision API error:', error);
      throw new BadRequestException('Failed to detect landmarks in image');
    }
  }

  /**
   * Detect text in an image (useful for monument signs/plaques)
   */
  async detectText(imageBuffer: Buffer): Promise<string[]> {
    try {
      const [result] = await this.client.textDetection({
        image: {
          content: imageBuffer,
        },
      });

      const texts: string[] = [];
      if (result.textAnnotations && result.textAnnotations.length > 0) {
        for (const annotation of result.textAnnotations) {
          if (annotation.description) {
            texts.push(annotation.description);
          }
        }
      }

      return texts;
    } catch (error) {
      this.logger.error('Text detection error:', error);
      return [];
    }
  }

  /**
   * Get image properties (colors, etc.)
   */
  async getImageProperties(imageBuffer: Buffer): Promise<any> {
    try {
      const [result] = await this.client.imageProperties({
        image: {
          content: imageBuffer,
        },
      });

      return result.imagePropertiesAnnotation;
    } catch (error) {
      this.logger.error('Image properties error:', error);
      return null;
    }
  }
}
