# Complete .env File Setup

## 🎯 You Already Have:
✅ Google Vision API credentials (downloaded JSON file)

## 📋 What You Need:
1. ✅ Google Vision API (Done!)
2. ⏳ Cloudinary (Need to sign up - free)
3. ⏳ Google Places API (Optional for now)

---

## 📁 Create Your .env File

Create a file named `.env` in your project root:
```
D:\Projects\TripVerse\TripVerse-Backend\.env
```

---

## 🔑 From Your Downloaded JSON File

You have: `tripverse-monument-recognition-c41682e93d47.json`

### Extract These Values:

```json
{
  "project_id": "tripverse-monument-recognition",
  "client_email": "monument-recognition@tripverse-monument-recognition.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
}
```

**Copy the ENTIRE private_key including the BEGIN/END lines and \n characters!**

---

## 📝 Complete .env File Content

```env
# ============================================
# Database Configuration
# ============================================
DATABASE_URL=postgresql://user:password@localhost:5432/tripverse
DIRECT_URL=postgresql://user:password@localhost:5432/tripverse

# ============================================
# JWT Configuration
# ============================================
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# ============================================
# Server Configuration
# ============================================
PORT=3000
NODE_ENV=development

# ============================================
# Cloudinary Configuration (Get from: https://cloudinary.com)
# ============================================
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# ============================================
# Google Vision API Configuration (API Key)
# ============================================
GOOGLE_VISION_API_KEY=your-google-vision-api-key-here

# ============================================
# Google Places API Configuration (Optional - Leave empty for now)
# ============================================
GOOGLE_PLACES_API_KEY=
```

---

## ⚠️ Important Notes

### 1. Google Vision API Key
```env
GOOGLE_VISION_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
**Make sure to copy the full API key without any spaces or extra characters.**

### 2. Cloudinary Setup
Go to: https://cloudinary.com
- Sign up for free account
- Copy credentials from Dashboard
- Add to .env file

See `CLOUDINARY_SETUP.md` for detailed instructions.

### 3. Database Configuration
Update DATABASE_URL with your actual PostgreSQL credentials.

---

## ✅ Checklist

- [ ] Create `.env` file in project root
- [ ] Add all environment variables above
- [ ] Copy Google Vision credentials from JSON file
- [ ] Sign up for Cloudinary and add credentials
- [ ] Update DATABASE_URL with your database info
- [ ] Save the `.env` file
- [ ] Restart your server: `npm run start:dev`

---

## 🧪 Test Your Setup

After creating `.env` file, restart server:

```bash
npm run start:dev
```

You should see:
```
[Nest] Starting Nest application...
[Nest] Successfully started server on port 3000
```

If you see errors about missing environment variables, check that:
1. `.env` file exists in project root
2. All variables are spelled correctly
3. Quotes are properly placed (especially on private_key)

---

## 🎉 You're Almost There!

Once `.env` is configured:
1. Google Vision ✅
2. Cloudinary ⏳ (sign up needed)
3. Test monument recognition!

See `TEST_MONUMENT_RECOGNITION.md` for testing instructions.
