import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

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
  private readonly apiKey: string;
  private readonly baseUrl = 'https://vision.googleapis.com/v1/images:annotate';

  constructor(private configService: ConfigService) {
    // Initialize with API key
    this.apiKey = this.configService.get('GOOGLE_VISION_API_KEY') || '';
    
    if (!this.apiKey || this.apiKey.trim() === '') {
      this.logger.warn('Google Vision API key not configured');
    } else {
      this.logger.log('Google Vision API initialized with API key');
    }
  }

  /**
   * Detect landmarks in an image using Google Vision API (REST API with API key)
   */
  async detectLandmarks(imageBuffer: Buffer): Promise<LandmarkDetectionResult[]> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        throw new BadRequestException('Google Vision API key is not configured');
      }

      // Validate image buffer
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new BadRequestException('Invalid image buffer provided');
      }

      this.logger.log(`Starting landmark detection... (image size: ${imageBuffer.length} bytes)`);

      // Convert image buffer to base64
      const base64Image = imageBuffer.toString('base64');

      // Prepare REST API request
      const requestBody = {
        requests: [
          {
            image: {
              content: base64Image,
            },
            features: [
              {
                type: 'LANDMARK_DETECTION',
                maxResults: 10,
              },
            ],
            imageContext: {
              languageHints: ['en'],
            },
          },
        ],
      };

      // Make REST API call
      this.logger.debug(`Calling Google Vision API: ${this.baseUrl}`);
      const response = await axios.post(
        `${this.baseUrl}?key=${this.apiKey}`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 seconds timeout
        }
      );

      // Log response status
      this.logger.debug(`Google Vision API response status: ${response.status}`);

      const landmarks: LandmarkDetectionResult[] = [];

      // Parse response
      if (response.data?.responses && response.data.responses.length > 0) {
        const result = response.data.responses[0];

        // Log full response for debugging when no landmarks found
        if (!result.landmarkAnnotations || result.landmarkAnnotations.length === 0) {
          this.logger.warn('Google Vision API returned no landmark annotations');
          this.logger.debug('Full API response:', JSON.stringify(result, null, 2));
          
          // Check if there are other annotations that might help debug
          if (result.labelAnnotations && result.labelAnnotations.length > 0) {
            const labels = result.labelAnnotations.slice(0, 5).map((l: any) => l.description).join(', ');
            this.logger.log(`Detected labels (not landmarks): ${labels}`);
          }
        }

        if (result.landmarkAnnotations && result.landmarkAnnotations.length > 0) {
          for (const annotation of result.landmarkAnnotations) {
            if (annotation.description && annotation.score !== undefined) {
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

        // Check for errors in response
        if (result.error) {
          this.logger.error('Google Vision API returned error:', result.error);
          throw new BadRequestException(
            result.error.message || 'Failed to detect landmarks in image'
          );
        }
      } else {
        this.logger.warn('Google Vision API returned empty responses array');
        this.logger.debug('Full API response:', JSON.stringify(response.data, null, 2));
      }

      this.logger.log(`Detected ${landmarks.length} landmarks`);
      return landmarks;
    } catch (error) {
      // Handle axios errors
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        if (axiosError.response) {
          // API returned error response
          const status = axiosError.response.status;
          const errorData = axiosError.response.data as any;

          this.logger.error(
            `Google Vision API error (${status}):`,
            errorData?.error?.message || axiosError.message
          );

          if (status === 400) {
            throw new BadRequestException(
              errorData?.error?.message || 'Invalid image or request format'
            );
          } else if (status === 403) {
            throw new BadRequestException(
              'Google Vision API key is invalid or restricted. Please check your API key configuration.'
            );
          } else if (status === 429) {
            throw new BadRequestException(
              'Google Vision API rate limit exceeded. Please try again later.'
            );
          } else {
            throw new BadRequestException(
              errorData?.error?.message || 'Failed to detect landmarks in image'
            );
          }
        } else if (axiosError.request) {
          // Request made but no response received
          this.logger.error('Google Vision API request timeout or network error');
          throw new BadRequestException(
            'Failed to connect to Google Vision API. Please check your internet connection.'
          );
        }
      }

      // Handle other errors
      this.logger.error('Google Vision API error:', (error as Error).message);
      throw new BadRequestException('Failed to detect landmarks in image');
    }
  }

  /**
   * Detect labels in an image (useful for providing feedback when landmarks aren't detected)
   */
  async detectLabels(imageBuffer: Buffer): Promise<string[]> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Google Vision API key not configured, skipping label detection');
        return [];
      }

      // Convert image buffer to base64
      const base64Image = imageBuffer.toString('base64');

      // Prepare REST API request
      const requestBody = {
        requests: [
          {
            image: {
              content: base64Image,
            },
            features: [
              {
                type: 'LABEL_DETECTION',
                maxResults: 10,
              },
            ],
          },
        ],
      };

      // Make REST API call
      const response = await axios.post(
        `${this.baseUrl}?key=${this.apiKey}`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const labels: string[] = [];

      if (response.data?.responses && response.data.responses.length > 0) {
        const result = response.data.responses[0];

        if (result.labelAnnotations && result.labelAnnotations.length > 0) {
          for (const annotation of result.labelAnnotations) {
            if (annotation.description && annotation.score && annotation.score > 0.5) {
              labels.push(annotation.description);
            }
          }
        }

        if (result.error) {
          this.logger.error('Label detection error:', result.error);
          return [];
        }
      }

      return labels;
    } catch (error) {
      this.logger.error('Label detection error:', (error as Error).message);
      return [];
    }
  }

  /**
   * Detect text in an image (useful for monument signs/plaques)
   * Note: This method is kept for potential future use but may need REST API conversion
   */
  async detectText(imageBuffer: Buffer): Promise<string[]> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Google Vision API key not configured, skipping text detection');
        return [];
      }

      // Convert image buffer to base64
      const base64Image = imageBuffer.toString('base64');

      // Prepare REST API request
      const requestBody = {
        requests: [
          {
            image: {
              content: base64Image,
            },
            features: [
              {
                type: 'TEXT_DETECTION',
                maxResults: 10,
              },
            ],
          },
        ],
      };

      // Make REST API call
      const response = await axios.post(
        `${this.baseUrl}?key=${this.apiKey}`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const texts: string[] = [];

      if (response.data?.responses && response.data.responses.length > 0) {
        const result = response.data.responses[0];

        if (result.textAnnotations && result.textAnnotations.length > 0) {
          for (const annotation of result.textAnnotations) {
            if (annotation.description) {
              texts.push(annotation.description);
            }
          }
        }

        if (result.error) {
          this.logger.error('Text detection error:', result.error);
          return [];
        }
      }

      return texts;
    } catch (error) {
      this.logger.error('Text detection error:', (error as Error).message);
      return [];
    }
  }

  /**
   * Get image properties (colors, etc.)
   * Note: This method is kept for potential future use but may need REST API conversion
   */
  async getImageProperties(imageBuffer: Buffer): Promise<any> {
    try {
      if (!this.apiKey || this.apiKey.trim() === '') {
        this.logger.warn('Google Vision API key not configured, skipping image properties');
        return null;
      }

      // Convert image buffer to base64
      const base64Image = imageBuffer.toString('base64');

      // Prepare REST API request
      const requestBody = {
        requests: [
          {
            image: {
              content: base64Image,
            },
            features: [
              {
                type: 'IMAGE_PROPERTIES',
                maxResults: 1,
              },
            ],
          },
        ],
      };

      // Make REST API call
      const response = await axios.post(
        `${this.baseUrl}?key=${this.apiKey}`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data?.responses && response.data.responses.length > 0) {
        const result = response.data.responses[0];

        if (result.error) {
          this.logger.error('Image properties error:', result.error);
          return null;
        }

        return result.imagePropertiesAnnotation || null;
      }

      return null;
    } catch (error) {
      this.logger.error('Image properties error:', (error as Error).message);
      return null;
    }
  }
}
