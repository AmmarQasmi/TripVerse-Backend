# API Keys Setup Guide

This guide will help you obtain and configure API keys for Google Vision, Google Places, and Wikipedia APIs.

## 📁 Where to Add API Keys

### File: `.env` (Root directory - CREATE THIS FILE IF IT DOESN'T EXIST)

**Location**: `D:\Projects\TripVerse\TripVerse-Backend\.env`

Create a `.env` file in your project root directory and add these environment variables:

```env
# Google Vision API Configuration
GOOGLE_VISION_CLIENT_EMAIL=your-service-account-email@project.iam.gserviceaccount.com
GOOGLE_VISION_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----\n"
GOOGLE_VISION_PROJECT_ID=your-project-id

# Google Places API Configuration
GOOGLE_PLACES_API_KEY=your-google-places-api-key

# Wikipedia API (No key required - Free to use)
# Wikipedia API is public and doesn't require authentication
```

---

## 🔑 Google Vision API Setup

### Step 1: Create Google Cloud Account
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click "Get Started" if it's your first time

### Step 2: Create a New Project

**⚠️ If you encounter issues after 2FA authentication:**

**Option A: Wait and Refresh**
1. After completing 2FA, wait 10-15 seconds
2. Refresh the page (F5 or Ctrl+R)
3. You should see the project creation page

**Option B: Try Incognito/Private Window**
1. Open Google Cloud Console in an incognito/private window
2. Sign in and complete 2FA
3. Navigate to console.cloud.google.com directly

**Option C: Use Existing Project**
1. If you already have any Google Cloud project, use that instead
2. Go to the project dropdown and select any existing project
3. Skip to Step 3 (Enable APIs)

**Standard Steps:**
1. Click the project dropdown at the top (shows "Select a project")
2. Click "New Project" button
3. Enter project name: `TripVerse-Monument-Recognition`
4. Click "Create"
5. Wait for project creation (usually 10-30 seconds)

### Step 3: Enable Vision API
1. In the navigation menu, go to **"APIs & Services" > "Library"**
2. Search for **"Cloud Vision API"**
3. Click on it and press **"Enable"**
4. Wait for activation (may take a few seconds)

### Step 4: Create Service Account
1. Go to **"APIs & Services" > "Credentials"**
2. Click **"+ CREATE CREDENTIALS"** dropdown
3. Select **"Service account"**
4. Fill in:
   - Service account name: `monument-recognition`
   - Service account ID: auto-generated
   - Click **"Create and Continue"**
5. Skip grant access (click **"Continue"**)
6. Click **"Done"**

### Step 5: Create and Download Key
1. Find your service account in the list
2. Click on the service account email
3. Go to **"Keys"** tab
4. Click **"Add Key" > "Create new key"**
5. Select **"JSON"** format
6. Click **"Create"** (downloads automatically)

### Step 6: Extract Credentials from JSON
Open the downloaded JSON file. You'll see:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service-account@project.iam.gserviceaccount.com",
  ...
}
```

Copy these values to your `.env`:
- `GOOGLE_VISION_PROJECT_ID` = `project_id`
- `GOOGLE_VISION_CLIENT_EMAIL` = `client_email`
- `GOOGLE_VISION_PRIVATE_KEY` = `private_key` (keep the quotes and \n characters)

---

## 📍 Google Places API Setup

### Step 1: Use Same Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your existing project (from Vision API setup)

### Step 2: Enable Places API
1. Navigate to **"APIs & Services" > "Library"**
2. Search for **"Places API"**
3. Click on it and press **"Enable"**
4. Wait for activation

### Step 3: Create API Key
1. Go to **"APIs & Services" > "Credentials"**
2. Click **"+ CREATE CREDENTIALS"**
3. Select **"API key"**
4. Copy the generated API key

### Step 4: Restrict API Key (Recommended for Security)
1. Click on the API key to edit it
2. Under **"API restrictions"**, select **"Restrict key"**
3. Choose **"Places API"** from the list
4. Click **"Save"**

### Step 5: Add to .env
```env
GOOGLE_PLACES_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 📚 Wikipedia API Setup

### Good News: No API Key Required!

Wikipedia API is **completely free** and **doesn't require authentication**.

### How It Works:
- The API is publicly accessible
- No signup or registration needed
- Rate limits: 200 requests/second per IP
- More than enough for monument recognition use

### How to Use:
Just access the Wikipedia REST API endpoint:
```
https://en.wikipedia.org/api/rest_v1/page/summary/{title}
```

**No configuration needed!** The code already handles this.

---

## 🔒 Security Best Practices

### 1. Never Commit API Keys
```bash
# Make sure .env is in .gitignore
echo ".env" >> .gitignore
```

### 2. Use Environment Variables
Always use `.env` file and never hardcode keys in your code.

### 3. Restrict API Keys
- For Google Places: Restrict to specific APIs
- For Google Vision: Use service account (better security)
- Set up billing alerts in Google Cloud Console

### 4. Rotate Keys Regularly
Change your API keys every 90 days for security.

---

## 💰 Pricing Information

### Google Vision API
- **Free Tier**: 1,000 units/month free
- **Pricing**: $1.50 per 1,000 units after free tier
- One image = 1 unit
- **Estimated Cost**: $0-5/month for moderate use

### Google Places API
- **Free Tier**: $200 credit/month (~100,000 requests)
- **Pricing**: Varies by request type
- **Estimated Cost**: $0-10/month for moderate use

### Wikipedia API
- **Cost**: FREE! 🎉
- Unlimited usage
- No billing needed

---

## 🧪 Testing Your API Keys

### Test Google Vision:
```bash
curl -X POST https://vision.googleapis.com/v1/images:annotate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @request.json
```

### Test Google Places:
```bash
curl "https://maps.googleapis.com/maps/api/place/textsearch/json?query=Eiffel+Tower&key=YOUR_API_KEY"
```

### Test Wikipedia:
```bash
curl "https://en.wikipedia.org/api/rest_v1/page/summary/Eiffel_Tower"
```

---

## ✅ Quick Setup Checklist

- [ ] Create Google Cloud account
- [ ] Create new project
- [ ] Enable Vision API
- [ ] Create service account
- [ ] Download JSON key file
- [ ] Extract credentials from JSON
- [ ] Enable Places API
- [ ] Create Places API key
- [ ] Add all credentials to `.env` file
- [ ] Test monument recognition endpoint
- [ ] Verify exports work correctly

---

## 🆘 Troubleshooting

### Issue: "2FA Redirect Loop" or "Nothing Happens After Authentication"

**Symptoms**: After completing 2-factor authentication, page stays blank or redirects in a loop.

**Solutions**:

1. **Clear Browser Cache**
   - Press `Ctrl + Shift + Delete`
   - Clear cached images and files for "All time"
   - Reload Google Cloud Console

2. **Disable Browser Extensions**
   - Try using Google Chrome/Safari in private/incognito mode
   - Temporarily disable ad blockers or privacy extensions

3. **Try Different Browser**
   - If using Chrome, try Edge or Firefox
   - Some browsers handle Google's authentication better

4. **Direct URL Access**
   ```
   https://console.cloud.google.com/projectcreate
   ```
   This takes you directly to project creation

5. **Accept Terms First**
   - Go to: https://console.cloud.google.com/welcome
   - Accept Terms of Service if prompted
   - Then try creating project again

6. **Enable Billing (May be Required)**
   - Go to: https://console.cloud.google.com/billing
   - Even if using free tier, you may need to add payment method
   - Google gives $300 free credit for new accounts

7. **Use Existing Project (Quick Alternative)**
   - If you've ever used Google Cloud before, you likely have a default project
   - Just proceed with enabling APIs in that project
   - No need to create a new one!

### Error: "API not enabled"
- Solution: Go to APIs & Services > Library and enable the required API

### Error: "Invalid credentials"
- Solution: Check that quotes and \n characters are preserved in private key

### Error: "Quota exceeded"
- Solution: Increase quota in Google Cloud Console or upgrade billing

### Error: "Permission denied"
- Solution: Make sure service account has necessary permissions

### Error: "Billing not enabled"
- Go to https://console.cloud.google.com/billing
- Link a billing account (even with free credits)
- Or use free tier with no credit card (limited features)

---

## 📞 Support

- **Google Cloud Support**: https://cloud.google.com/support
- **Google Places API Docs**: https://developers.google.com/maps/documentation/places/web-service
- **Vision API Docs**: https://cloud.google.com/vision/docs
- **Wikipedia API Docs**: https://www.mediawiki.org/wiki/API:Main_page

---

## 🎉 You're All Set!

Once you've added the API keys to your `.env` file, restart your NestJS server:

```bash
npm run start:dev
```

The monument recognition feature will now work with full API integration!
