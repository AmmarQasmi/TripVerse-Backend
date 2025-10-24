# Testing Monument Recognition (Vision + Wikipedia Only)

## ✅ Current Setup

You have:
- ✅ Google Vision API configured
- ✅ Wikipedia API (free, no key needed)
- ⏸️ Google Places API (optional, not configured yet)

## 📋 What Works Without Places API

The monument recognition will work perfectly with just Vision + Wikipedia:
- ✅ Landmark detection (Google Vision)
- ✅ Monument identification with confidence score
- ✅ Wikipedia information and description
- ✅ Coordinates from Vision API
- ✅ PDF/DOCX export generation
- ⚠️ No Google Places rating/reviews data (this is optional)

## 🔧 Environment Setup

### 1. Your `.env` File Should Have:

```env
# Required: Google Vision API
GOOGLE_VISION_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_VISION_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_VISION_PROJECT_ID=your-project-id

# Optional: Google Places API (can be empty for now)
GOOGLE_PLACES_API_KEY=

# Cloudinary (should already be configured)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### 2. If Places API Key is Missing

The code automatically handles missing Places API:
- It logs a warning but continues
- Vision and Wikipedia data will still be present
- Only Places-specific data (ratings, reviews) will be absent

## 🧪 Testing Steps

### Step 1: Start Your Server

```bash
npm run start:dev
```

### Step 2: Get a Test Image

Find a monument photo (or use one from test-images folder):
- Eiffel Tower
- Taj Mahal
- Big Ben
- Any famous landmark

### Step 3: Test Upload Endpoint

Using Postman, cURL, or any HTTP client:

```bash
curl -X POST http://localhost:3000/api/monuments/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@test-images/hotel1.jpeg"
```

### Step 4: Expected Response

```json
{
  "id": 1,
  "name": "Monument Name",
  "confidence": 0.95,
  "imageUrl": "https://cloudinary-url/image.jpg",
  "wikiSnippet": "Wikipedia description...",
  "wikipediaUrl": "https://en.wikipedia.org/wiki/Monument",
  "coordinates": {
    "lat": 48.8583,
    "lng": 2.2945
  },
  "placeDetails": null,  // <- This will be null without Places API
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Step 5: Test Export to PDF

```bash
curl -X POST http://localhost:3000/api/monuments/1/export/pdf \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Response:
```json
{
  "data": {
    "exportId": 1,
    "downloadUrl": "https://cloudinary-url/monument-export.pdf",
    "format": "pdf",
    "fileSize": 123456
  },
  "message": "PDF export generated successfully"
}
```

## 🎯 What You'll See

### ✅ Works Without Places API:
- Monument detection ✅
- Wikipedia information ✅
- Location coordinates ✅
- Confidence scores ✅
- Beautiful PDF export ✅
- DOCX export ✅

### ⚠️ Missing Without Places API:
- Google ratings/reviews
- Formatted address details
- Website links from Places

### 💡 Note:
**Wikipedia data is very comprehensive** and often provides better historical context than Places API anyway!

## 🐛 Debugging

### Check Logs for Errors:

Look for these in your console:
```
[MonumentsService] Starting monument recognition for user 1
[GoogleVisionService] Starting landmark detection...
[GoogleVisionService] Detected 1 landmarks
[MonumentsService] Detected landmark: Eiffel Tower (confidence: 0.95)
[WikipediaService] Searching Wikipedia for: Eiffel Tower
[WikipediaService] Found Wikipedia article: Eiffel Tower
[GooglePlacesService] Searching Google Places for: Eiffel Tower
[MonumentsService] Google Places enrichment failed: API key not configured
[MonumentsService] Monument recognition completed: 1
```

The "Google Places enrichment failed" warning is **expected and OK**!

## ✅ Success Criteria

Your test is successful if:
1. ✅ Image uploads successfully
2. ✅ Monument is detected by Vision API
3. ✅ Wikipedia information is retrieved
4. ✅ Response includes name, confidence, wikiSnippet
5. ✅ PDF export generates successfully
6. ⚠️ placeDetails is null (expected without Places API)

## 🚀 Next Steps

After testing works:
1. Add Google Places API later if you want ratings/reviews
2. It's completely optional - Vision + Wikipedia works great alone!

## 📞 Need Help?

If you encounter errors:
1. Check `.env` file has Vision API credentials
2. Verify Cloudinary is configured
3. Make sure you're sending valid JWT token
4. Check server logs for specific error messages
