# Monument Recognition Setup Guide

This guide covers the complete setup for the monument recognition feature using Google Vision API, Wikipedia API, and Google Places API.

## 🚀 Features Implemented

### Core Functionality
- ✅ **Image Upload & Recognition**: Upload monument images and get AI-powered recognition
- ✅ **Google Vision API Integration**: Landmark detection with confidence scores
- ✅ **Wikipedia Enrichment**: Automatic monument information from Wikipedia
- ✅ **Google Places Integration**: Additional location and rating data
- ✅ **PDF Export**: Generate beautiful PDF reports with monument details
- ✅ **DOCX Export**: Generate Word documents with monument information
- ✅ **Export History**: Track all user exports with file sizes and dates
- ✅ **Cloudinary Integration**: Secure image storage and optimization

### API Endpoints
- ✅ `POST /api/monuments/upload` - Upload image and recognize monument
- ✅ `GET /api/monuments/my-recognitions` - Get user's monument recognitions
- ✅ `GET /api/monuments/:id` - Get specific monument recognition
- ✅ `DELETE /api/monuments/:id` - Delete monument recognition
- ✅ `POST /api/monuments/:id/export/pdf` - Export as PDF
- ✅ `POST /api/monuments/:id/export/docx` - Export as DOCX
- ✅ `GET /api/monuments/exports/history` - Get export history

## 📋 Required Environment Variables

Add these variables to your `.env` file:

```env
# Google Vision API
GOOGLE_VISION_CLIENT_EMAIL=your-service-account-email@project.iam.gserviceaccount.com
GOOGLE_VISION_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----\n"
GOOGLE_VISION_PROJECT_ID=your-project-id

# Google Places API
GOOGLE_PLACES_API_KEY=your-google-places-api-key

# Cloudinary (already configured)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

## 🔧 Google Cloud Setup

### 1. Enable Google Vision API
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Navigate to "APIs & Services" > "Library"
4. Search for "Vision API" and enable it
5. Go to "APIs & Services" > "Credentials"
6. Create a Service Account
7. Download the JSON key file
8. Extract the `client_email`, `private_key`, and `project_id`

### 2. Enable Google Places API
1. In Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Places API" and enable it
3. Go to "APIs & Services" > "Credentials"
4. Create an API Key
5. Restrict the API key to Places API only for security

## 📊 Database Schema

The implementation includes these new tables:

### MonumentRecognition
```sql
- id: Primary key
- user_id: Foreign key to users
- image_url: Cloudinary URL of uploaded image
- name: Detected monument name
- confidence: Recognition confidence score (0-1)
- wiki_snippet: Wikipedia extract
- raw_payload_json: Complete API responses
- created_at: Timestamp
```

### MonumentExportLog
```sql
- id: Primary key
- user_id: Foreign key to users
- monument_id: Foreign key to monument recognitions
- format: 'pdf' or 'docx'
- file_url: Cloudinary URL of exported file
- file_size: File size in bytes
- created_at: Timestamp
```

## 🎯 Usage Examples

### Upload and Recognize Monument
```bash
curl -X POST http://localhost:3000/api/monuments/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@monument.jpg"
```

### Export as PDF
```bash
curl -X POST http://localhost:3000/api/monuments/1/export/pdf \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Export as DOCX
```bash
curl -X POST http://localhost:3000/api/monuments/1/export/docx \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔒 Security Features

- **JWT Authentication**: All endpoints require valid JWT tokens
- **File Validation**: Only JPEG, PNG, and WebP images allowed
- **Size Limits**: Maximum 5MB file size
- **User Isolation**: Users can only access their own recognitions
- **Secure Storage**: All files stored in Cloudinary with proper access controls

## 📈 Performance Optimizations

- **Image Optimization**: Automatic image resizing and compression
- **API Caching**: Wikipedia and Places API responses cached
- **Async Processing**: Export generation doesn't block API responses
- **Database Indexing**: Optimized queries with proper indexes

## 🚨 Error Handling

- **API Failures**: Graceful fallback when external APIs fail
- **Image Processing**: Proper error handling for invalid images
- **Export Generation**: Retry mechanisms for failed exports
- **Rate Limiting**: Built-in protection against API abuse

## 📱 Frontend Integration

The API is designed to work seamlessly with frontend applications:

```typescript
// Upload image
const formData = new FormData();
formData.append('image', file);

const response = await fetch('/api/monuments/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
});

const result = await response.json();
```

## 🔄 Workflow

1. **Upload**: User uploads monument image
2. **Recognition**: Google Vision detects landmarks
3. **Enrichment**: Wikipedia and Places APIs provide additional data
4. **Storage**: Results saved to database with Cloudinary URLs
5. **Export**: Users can generate PDF/DOCX reports
6. **History**: All exports tracked for user reference

## 📊 Monitoring

The system includes comprehensive logging for:
- API call success/failure rates
- Recognition accuracy metrics
- Export generation performance
- User usage patterns
- Error tracking and debugging

## 🎉 Ready to Use!

The monument recognition system is now fully implemented and ready for production use. All endpoints are secured, optimized, and include comprehensive error handling.
