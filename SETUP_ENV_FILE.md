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
# Google Vision API Configuration
# ============================================
GOOGLE_VISION_CLIENT_EMAIL=monument-recognition@tripverse-monument-recognition.iam.gserviceaccount.com
GOOGLE_VISION_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDD6XC45aXDpy6T\nm82vIL3n1KKy0BD8qonIbeQvcNDaExoCX3wlMy2fVO5VZX8vVbsLTqRPw/kaWmkK\nWhDyvip68Z9VTDy7U6LyIMVUzifGJ0cmu6YSmlvOhmpgXXYp8P/XSI+zMZWOFzJX\n4Brw3DlXQ6M+BGC8xfd4+TCZcT7O1PiuEyuuP2hOaOYjjjpelJXFDo88kzZJn1+k\nvZj2HGXppnCEhe/INmMRD4ejUXP4CkVznnmu5uwmwiJyQJRwnBnSDS+3XnkVx0f0\nVbY8MFWX9cEXGBaiSu6/n5tyUpsmjgX/BWBK3hnOz+KphMuxqteGpprOlnAR4enh\nJnm9O+ezAgMBAAECggEALuXsko6C+o3EZBiJifFcFKm90vFlB58pgZ3w4HxwuquU\n79l8xgj01G4H6dB0vFeZAZFvWxruQGVBPPWnlfx4/dpmioxIA433dV/r7Su2sMRJ\nT5ffHxftf0iFIZFuDoc/L4GSyNJHW27pIcknmd4WKfIqm1d/8uCvJ7n7bNgDsY41\nyhHzG6E9yjjGlHMI+cK0ohDsKvEtNtFsOV7jsAWzTOGBq1l1PVMt5Rv+F3qb+EZj\n3YQ7kvbcQcNH0i2G0jgIguijYK4ZU2b7H6FlaKEJ8Ubcl+yHDMzaXlTqP7NhjTWz\nC439fB/lYkOZB0EtSBj1O/u64W0DoveAtIecCllZhQKBgQDhyz/lIak8Gi3PCrh1\nptJjCMHHXhq6DRrmFn3xIuyLoc8cuzPHcfxo6ZoiKlwfsV9tDfh6p5PaVFCjxagH\nyJmB9VlT9hcPA1oIKsZYfUP1Fu82PAfl5l98242isih+o6i5bh2qQg6hkDZ7GuaE\nCLaoIsL9RVOsPW5lx1NaE5FQnQKBgQDeHtJPV9WAvx4jQhepFDhEO1k4GrGP3/QD\ngCX4d+hZ+S09NIBmgsAnZftLx+AiJFARVtJ8IhH7oMN3IMF9kyJPn+qwd5azrlhr\nUjQ5Hs6SURZfZ7xsiHSPRJOXA5QyWd5zHMedEQUptHQ6Yk3j584/zoaZQA+2zO9G\nUlPkv5lgjwKBgF6n6CdUTzAFAYM0SVP5FWWy/BlqF+Y7LDWc5Ds8mtGGid7Pk8te\nu6P3mkgMXgZjQ0/idXJl4hO7GPsvF1v7+m6Cvmn2VoBStWGLHQ9npB+Q98NSszTr\nuMgM+nlkGpnMXiUuRn1jp+KPJGfDRTPAu2INAJVQhN1F+4vrXcP7RAX5AoGAVdiR\nrcqjoKO80SGtJVLEQFKzs8RVVebXVzcC9dnZ+lQckOgmq/firhdzHSG91VQ1gc4N\ngZ5lVtwWT4dgYNkpzJ5gxR0jKIS8dZYKyvzGF7SxMeRU5ZmDew+k/xuJ/j/Pgqvf\n1iuK1EiDF0GBGxEvHGgEi1w/9oWUAJi3BdSrQa8CgYEArYk+jl213COXG9oePmcw\np1I8bPJBptVGzjK2Bdr0Fajia1hZ4Sv5xy24FWUzEIhc/VEIp5e67Jj+BhdPXIi5\na7ZYZeWEaV5rQ6nDAu0lpq9DMC4XLs/J54Q1MIYCuzIPv5dFMJAA+q1C3v/j/W2W\nm3l9BS63vyH9Y2Io+GsiK9Q=\n-----END PRIVATE KEY-----\n"
GOOGLE_VISION_PROJECT_ID=tripverse-monument-recognition

# ============================================
# Google Places API Configuration (Optional - Leave empty for now)
# ============================================
GOOGLE_PLACES_API_KEY=
```

---

## ⚠️ Important Notes

### 1. Keep Quotes on Private Key
```env
GOOGLE_VISION_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```
**The quotes and \n are important!**

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
