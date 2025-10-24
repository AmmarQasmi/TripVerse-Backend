# Quick Google Cloud Setup (When 2FA Redirect Fails)

## 🚀 Fastest Solution

### Step 1: Direct Project Creation
Open this URL directly in your browser:
```
https://console.cloud.google.com/projectcreate
```

### Step 2: After 2FA, Just Enable APIs
If you're stuck, skip project creation and just enable APIs:

1. Go to: https://console.cloud.google.com/apis/library
2. Search for "Cloud Vision API"
3. Click "Enable"
4. Repeat for "Places API"

### Step 3: Create Credentials

**For Vision API (Service Account):**
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click "Create Credentials" > "Service Account"
3. Name it and create
4. Click "Keys" tab > "Add Key" > "Create new key" > JSON
5. Download the file

**For Places API (API Key):**
1. Same page: https://console.cloud.google.com/apis/credentials
2. Click "Create Credentials" > "API Key"
3. Copy the key

### Step 4: Add to .env File

Open `.env` file in your project root and add:

```env
GOOGLE_VISION_CLIENT_EMAIL=from-the-downloaded-json-file
GOOGLE_VISION_PRIVATE_KEY="from-the-downloaded-json-file"
GOOGLE_VISION_PROJECT_ID=from-the-downloaded-json-file
GOOGLE_PLACES_API_KEY=the-copied-api-key
```

## 🎯 Alternative: Use Free Tier Without Google Cloud

If Google Cloud setup is problematic, you can test monument recognition using **only Wikipedia API** (which is free):

The code will work with:
- ✅ Image upload and storage (Cloudinary)
- ✅ Wikipedia enrichment
- ⚠️ Basic recognition (without Google Vision)
- ❌ Google Places data

To enable Wikipedia-only mode, comment out Google Vision in the code temporarily.

## 💡 Pro Tip

**Most Common Issue**: Billing account not linked

Solution: Even for free tier, Google requires a billing account to be set up:
1. Go to: https://console.cloud.google.com/billing
2. Add payment method
3. Get $300 free credit
4. No charges unless you exceed free tier

This usually fixes the 2FA redirect issue!
