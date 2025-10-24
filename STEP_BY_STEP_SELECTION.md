# Current Step: Select Application Data

## ✅ What You Need to Do RIGHT NOW:

On the Google Cloud Console page you're seeing:

### Step 1: Select Data Type
- **✅ Select: "Application data"** (the second radio button)
- This is the correct choice because the info box says: "This Google Cloud API is usually accessed from a server using a service account"

### Step 2: Click "Next"
After selecting "Application data", the "Next" button will become enabled (turn blue).
Click it to proceed.

---

## 📸 Your Current Screen:

You should see:
- API: Cloud Vision API (already selected ✓)
- Two options:
  - ○ User data (NOT THIS ONE)
  - ○ **Application data** ← SELECT THIS ONE

---

## ⚠️ Important:

**Select "Application data"** - This will create a service account which is what you need for your backend API to access Google Vision.

**DO NOT select "User data"** - That's for OAuth and user-facing applications, not backend APIs.

---

## ➡️ After Selecting "Application data":

1. Click "Next" button
2. You'll be taken to service account creation page
3. Follow the remaining steps to download your JSON key file

---

## 🎯 Why Application Data?

- ✅ Works with server-side applications (your NestJS backend)
- ✅ Creates a service account with proper permissions
- ✅ No user interaction required
- ✅ Ideal for AI/ML APIs like Vision API
- ✅ Secure credential storage
