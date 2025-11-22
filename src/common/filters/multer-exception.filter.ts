import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    // Handle multer errors
    if (exception.message && exception.message.includes('MulterError')) {
      let status = HttpStatus.BAD_REQUEST;
      let message = 'File upload error';

      if (exception.message.includes('LIMIT_FILE_SIZE')) {
        message = 'File size exceeds the maximum allowed size (10MB)';
      } else if (exception.message.includes('LIMIT_FILE_COUNT')) {
        message = 'Too many files uploaded. Maximum 10 files allowed.';
      } else if (exception.message.includes('LIMIT_UNEXPECTED_FILE')) {
        message = 'Unexpected file field name';
      } else {
        message = exception.message;
      }

      return response.status(status).json({
        statusCode: status,
        message,
        error: 'Bad Request',
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }

    // Handle other errors
    if (exception instanceof BadRequestException) {
      const exceptionResponse = exception.getResponse();
      const status = exception.getStatus();
      
      return response.status(status).json({
        statusCode: status,
        ...(typeof exceptionResponse === 'string'
          ? { message: exceptionResponse }
          : exceptionResponse),
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }

    // Default error response
    const status = exception.status || HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({
      statusCode: status,
      message: exception.message || 'Internal server error',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

