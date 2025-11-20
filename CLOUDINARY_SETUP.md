# Cloudinary Setup Guide

## 📋 What You Need

Cloudinary requires 3 environment variables:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

## 🚀 How to Get Cloudinary Credentials

### Step 1: Create Cloudinary Account (FREE!)

1. Go to: https://cloudinary.com/users/register/free
2. Sign up with your email (it's free!)
3. Complete email verification

### Step 2: Access Your Dashboard

1. Log in to: https://console.cloudinary.com/
2. You'll see your Dashboard

### Step 3: Get Your Credentials

On the Dashboard, you'll see:
```
Account Details:
- Cloud name: xxxxx
- API Key: xxxxxx
- API Secret: xxxxxx
```

**Copy these three values!**

### Step 4: Add to .env File

Open your `.env` file and add:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

## 💰 Cloudinary Pricing

### Free Tier Includes:
- ✅ 25 GB storage
- ✅ 25 GB bandwidth/month
- ✅ 25,000 transformations/month
- ✅ 1 user
- ✅ Core features
- ✅ **Perfect for development and small projects!**

### More Than Enough For:
- Monument image uploads
- PDF/DOCX export storage
- Image optimization
- Transformations

## ⚠️ Important Notes

1. **Keep API Secret Safe**: Never commit to Git
2. **Add .env to .gitignore**: Already done in your project
3. **Free Tier is Generous**: 25GB is plenty for testing

## 🧪 Test Cloudinary Setup

After adding credentials, restart your server and try uploading an image.

If Cloudinary is not configured, you'll see errors like:
```
Cloudinary upload error: Invalid cloud_name
```

If configured correctly, images will upload successfully!

## 📱 Alternative: Use Mock Storage (Not Recommended)

If you want to skip Cloudinary temporarily for testing:
- You can modify the code to save files locally
- But for production, Cloudinary is essential for image handling

## ✅ Summary

1. Sign up at https://cloudinary.com (free)
2. Copy credentials from Dashboard
3. Add to `.env` file
4. Restart server
5. Done!

---

**Total Time**: ~5 minutes  
**Cost**: $0 (free tier)  
**Difficulty**: Easy 🟢
