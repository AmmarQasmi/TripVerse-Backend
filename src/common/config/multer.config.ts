import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const multerConfig: MulterOptions = {
  storage: memoryStorage(),
  fileFilter: (req: any, file: any, callback: any) => {
    // Allow files without mimetype (some clients don't send it)
    if (!file.mimetype) {
      return callback(null, true);
    }

    // Check if file is an image or PDF (for documents)
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
    ];
    if (!allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      // Return false without error to prevent multer from throwing
      return callback(null, false);
    }
    callback(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
};

export const imageUploadConfig: MulterOptions = {
  storage: memoryStorage(),
  fileFilter: (req: any, file: any, callback: any) => {
    // Allow files without mimetype (some clients don't send it)
    if (!file.mimetype) {
      return callback(null, true);
    }

    // Check if file is an image
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      // Return false without error to prevent multer from throwing
      return callback(null, false);
    }
    callback(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10, // Maximum 10 files
  },
};
