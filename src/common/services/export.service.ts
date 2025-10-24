import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { MonumentRecognitionResult } from '../../monuments/monuments.service';
import * as puppeteer from 'puppeteer';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { randomUUID } from 'crypto';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private configService: ConfigService,
    private cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Generate PDF export for monument recognition
   */
  async generatePDF(recognition: MonumentRecognitionResult): Promise<Buffer> {
    try {
      this.logger.log(`Generating PDF for monument: ${recognition.name}`);

      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      
      // Set viewport for consistent rendering
      await page.setViewport({ width: 1200, height: 800 });

      // Generate HTML content
      const htmlContent = this.generateHTMLContent(recognition);

      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
      });

      await browser.close();

      this.logger.log('PDF generated successfully');
      return Buffer.from(pdfBuffer);

    } catch (error) {
      this.logger.error('PDF generation failed:', error);
      throw new BadRequestException('Failed to generate PDF export');
    }
  }

  /**
   * Generate DOCX export for monument recognition
   */
  async generateDOCX(recognition: MonumentRecognitionResult): Promise<Buffer> {
    try {
      this.logger.log(`Generating DOCX for monument: ${recognition.name}`);

      const children: Paragraph[] = [
        // Title
        new Paragraph({
          children: [
            new TextRun({
              text: `Monument Recognition Report`,
              bold: true,
              size: 32,
            }),
          ],
          heading: HeadingLevel.TITLE,
        }),

        // Monument Name
        new Paragraph({
          children: [
            new TextRun({
              text: `Monument: ${recognition.name}`,
              bold: true,
              size: 24,
            }),
          ],
          heading: HeadingLevel.HEADING_1,
        }),

        // Confidence Score
        new Paragraph({
          children: [
            new TextRun({
              text: `Recognition Confidence: ${(recognition.confidence * 100).toFixed(1)}%`,
              bold: true,
              size: 20,
            }),
          ],
        }),

        // Date
        new Paragraph({
          children: [
            new TextRun({
              text: `Recognized on: ${recognition.createdAt.toLocaleDateString()}`,
              size: 18,
            }),
          ],
        }),
      ];

      // Wikipedia Information
      if (recognition.wikiSnippet) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `About ${recognition.name}:`,
                bold: true,
                size: 20,
              }),
            ],
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: recognition.wikiSnippet,
                size: 16,
              }),
            ],
          })
        );
      }

      // Location Information
      if (recognition.coordinates) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Location:`,
                bold: true,
                size: 20,
              }),
            ],
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Coordinates: ${recognition.coordinates.lat.toFixed(6)}, ${recognition.coordinates.lng.toFixed(6)}`,
                size: 16,
              }),
            ],
          })
        );
      }

      // Google Places Information
      if (recognition.placeDetails) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Additional Information:`,
                bold: true,
                size: 20,
              }),
            ],
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Address: ${recognition.placeDetails.formatted_address}`,
                size: 16,
              }),
            ],
          })
        );

        if (recognition.placeDetails.rating) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `Rating: ${recognition.placeDetails.rating}/5 (${recognition.placeDetails.user_ratings_total} reviews)`,
                  size: 16,
                }),
              ],
            })
          );
        }

        if (recognition.placeDetails.website) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `Website: ${recognition.placeDetails.website}`,
                  size: 16,
                }),
              ],
            })
          );
        }
      }

      // Footer
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Generated by TripVerse Monument Recognition System`,
              size: 12,
              italics: true,
            }),
          ],
        })
      );

      const doc = new Document({
        sections: [
          {
            properties: {},
            children,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      this.logger.log('DOCX generated successfully');
      return Buffer.from(buffer);

    } catch (error) {
      this.logger.error('DOCX generation failed:', error);
      throw new BadRequestException('Failed to generate DOCX export');
    }
  }

  /**
   * Upload export file to Cloudinary and return URL
   */
  async uploadExportFile(
    buffer: Buffer,
    format: 'pdf' | 'docx',
    monumentName: string,
  ): Promise<{ url: string; publicId: string }> {
    try {
      const fileName = `monument-export-${monumentName.replace(/[^a-zA-Z0-9]/g, '-')}-${randomUUID()}`;
      
      const uploadResult = await this.cloudinaryService.uploadImage(
        { buffer, originalname: `${fileName}.${format}` },
        'exports',
        {
          public_id: fileName,
        } as any
      );

      return {
        url: (uploadResult as any).secure_url,
        publicId: (uploadResult as any).public_id,
      };

    } catch (error) {
      this.logger.error('Export file upload failed:', error);
      throw new BadRequestException('Failed to upload export file');
    }
  }

  /**
   * Generate HTML content for PDF
   */
  private generateHTMLContent(recognition: MonumentRecognitionResult): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Monument Recognition Report</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              text-align: center;
              border-bottom: 3px solid #007bff;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .title {
              font-size: 28px;
              font-weight: bold;
              color: #007bff;
              margin-bottom: 10px;
            }
            .monument-name {
              font-size: 24px;
              font-weight: bold;
              color: #333;
              margin-bottom: 20px;
            }
            .confidence {
              background: #e8f5e8;
              padding: 10px;
              border-radius: 5px;
              margin-bottom: 20px;
              font-size: 18px;
              font-weight: bold;
            }
            .section {
              margin-bottom: 25px;
            }
            .section-title {
              font-size: 20px;
              font-weight: bold;
              color: #007bff;
              margin-bottom: 10px;
              border-bottom: 1px solid #ddd;
              padding-bottom: 5px;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin-bottom: 20px;
            }
            .info-item {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 5px;
            }
            .info-label {
              font-weight: bold;
              color: #666;
              margin-bottom: 5px;
            }
            .info-value {
              color: #333;
            }
            .image-container {
              text-align: center;
              margin: 20px 0;
            }
            .monument-image {
              max-width: 100%;
              height: auto;
              border-radius: 10px;
              box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            }
            .footer {
              text-align: center;
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              color: #666;
              font-style: italic;
            }
            .wikipedia-link {
              color: #007bff;
              text-decoration: none;
            }
            .wikipedia-link:hover {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Monument Recognition Report</div>
            <div class="monument-name">${recognition.name}</div>
            <div class="confidence">
              Recognition Confidence: ${(recognition.confidence * 100).toFixed(1)}%
            </div>
          </div>

          <div class="image-container">
            <img src="${recognition.imageUrl}" alt="${recognition.name}" class="monument-image" />
          </div>

          <div class="section">
            <div class="section-title">Recognition Details</div>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Recognized On</div>
                <div class="info-value">${recognition.createdAt.toLocaleDateString()}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Confidence Score</div>
                <div class="info-value">${(recognition.confidence * 100).toFixed(1)}%</div>
              </div>
            </div>
          </div>

          ${recognition.coordinates ? `
          <div class="section">
            <div class="section-title">Location Information</div>
            <div class="info-item">
              <div class="info-label">Coordinates</div>
              <div class="info-value">${recognition.coordinates.lat.toFixed(6)}, ${recognition.coordinates.lng.toFixed(6)}</div>
            </div>
          </div>
          ` : ''}

          ${recognition.wikiSnippet ? `
          <div class="section">
            <div class="section-title">About ${recognition.name}</div>
            <p>${recognition.wikiSnippet}</p>
            ${recognition.wikipediaUrl ? `<p><a href="${recognition.wikipediaUrl}" class="wikipedia-link">Read more on Wikipedia</a></p>` : ''}
          </div>
          ` : ''}

          ${recognition.placeDetails ? `
          <div class="section">
            <div class="section-title">Additional Information</div>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Address</div>
                <div class="info-value">${recognition.placeDetails.formatted_address}</div>
              </div>
              ${recognition.placeDetails.rating ? `
              <div class="info-item">
                <div class="info-label">Rating</div>
                <div class="info-value">${recognition.placeDetails.rating}/5 (${recognition.placeDetails.user_ratings_total} reviews)</div>
              </div>
              ` : ''}
              ${recognition.placeDetails.website ? `
              <div class="info-item">
                <div class="info-label">Website</div>
                <div class="info-value"><a href="${recognition.placeDetails.website}" class="wikipedia-link">${recognition.placeDetails.website}</a></div>
              </div>
              ` : ''}
            </div>
          </div>
          ` : ''}

          <div class="footer">
            Generated by TripVerse Monument Recognition System
          </div>
        </body>
      </html>
    `;
  }
}
