# 🔥 Production Cookie Authentication Fix

## Problem
After login, API requests fail with 401 errors because cookies are not being sent between Vercel (frontend) and Render (backend).

## Root Causes
1. Missing/incorrect `FRONTEND_URL` in Render environment variables
2. `NODE_ENV` might not be set to `production`
3. CORS configuration needs verification

---

## ✅ Solution Steps

### 1. Update Render Environment Variables

Go to [Render Dashboard](https://dashboard.render.com) → Your Service → Environment Tab

**Set these CRITICAL variables:**

```env
NODE_ENV=production
FRONTEND_URL=https://trip-verse-frontend.vercel.app
```

**If you also want to support localhost during development:**
```env
FRONTEND_URL=https://trip-verse-frontend.vercel.app,http://localhost:3000
```

### 2. Verify Other Required Variables

Make sure these are also set in Render:

```env
DATABASE_URL=<your-supabase-connection-pooling-url>
DIRECT_URL=<your-supabase-direct-url>
JWT_SECRET=<strong-random-string>
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=<your-value>
CLOUDINARY_API_KEY=<your-value>
CLOUDINARY_API_SECRET=<your-value>
GOOGLE_VISION_API_KEY=<your-value>
GOOGLE_PLACES_API_KEY=<your-value>
GOOGLE_DISTANCE_MATRIX_API_KEY=<your-value>
DUFFEL_API_KEY=<your-value>
DUFFEL_API_URL=https://api.duffel.com
NEXT_PUBLIC_APP_URL=https://trip-verse-frontend.vercel.app
```

### 3. Verify Vercel Environment Variables

Go to [Vercel Dashboard](https://vercel.com/dashboard) → Your Project → Settings → Environment Variables

**Set for Production environment:**
```env
NEXT_PUBLIC_API_URL=https://tripverse-backend-ztsz.onrender.com
```

### 4. Redeploy Both Services

**Render:**
- After updating env vars, Render auto-redeploys (2-3 minutes)
- Check logs to verify: `Environment: production`
- Look for: `CORS enabled for: https://trip-verse-frontend.vercel.app`

**Vercel:**
- Go to Deployments tab
- Click "Redeploy" on latest deployment
- OR push a new commit to trigger deployment

---

## 🔍 Testing Authentication

### Test 1: Check Backend CORS
```bash
curl -i https://tripverse-backend-ztsz.onrender.com/auth/health
```

Expected headers:
```
Access-Control-Allow-Origin: https://trip-verse-frontend.vercel.app
Access-Control-Allow-Credentials: true
```

### Test 2: Test Login
Go to: https://trip-verse-frontend.vercel.app/auth/login

Open Browser DevTools → Network Tab

1. **Login request** - check response headers:
   ```
   Set-Cookie: access_token=<jwt>; Path=/; HttpOnly; Secure; SameSite=None
   ```

2. **Subsequent API requests** - check request headers:
   ```
   Cookie: access_token=<jwt>
   ```

### Test 3: Check Cookie Debugging
```bash
# Login first via UI, then test this endpoint
curl https://tripverse-backend-ztsz.onrender.com/auth/check-cookie \
  -H "Cookie: access_token=<your-token>" \
  --verbose
```

### Test 4: Check Backend Logs
In Render dashboard → Logs tab, after login you should see:
```
🔐 Login request received for: user@example.com
✅ Authentication successful, setting cookie...
🍪 Setting cookie with options: { isProduction: true, secure: true, sameSite: 'none', ... }
📝 Set-Cookie header should be sent
🍪 Cookie set, returning response
```

---

## 🐛 Common Issues & Fixes

### Issue 1: "CORS error" in browser console
**Symptom:** `Access to XMLHttpRequest blocked by CORS policy`

**Fix:**
- Verify `FRONTEND_URL` in Render matches EXACTLY: `https://trip-verse-frontend.vercel.app` (no trailing slash)
- Check Render logs show: `CORS enabled for: https://trip-verse-frontend.vercel.app`
- Redeploy if changed

### Issue 2: Cookie not being set
**Symptom:** Login succeeds but no `Set-Cookie` in response headers

**Fix:**
- Check `NODE_ENV=production` is set in Render
- Verify backend logs show `isProduction: true` when setting cookie
- Check response headers include `Set-Cookie` with `Secure; SameSite=None`

### Issue 3: Cookie set but not sent with requests
**Symptom:** Login works, cookie visible in DevTools → Application → Cookies, but not sent with API requests

**Fix:**
- Verify cookie has `Secure` and `SameSite=None` flags
- Check frontend is using `withCredentials: true` (already configured in your http.ts)
- Ensure both domains use HTTPS (Vercel and Render both do by default)

### Issue 4: 401 on /auth/me immediately after login
**Symptom:** Login logs show success, but next request gets 401

**Possible causes:**
1. **JWT_SECRET mismatch** - backend token generated with different secret than validator expects
   - Fix: Ensure `JWT_SECRET` is the SAME in Render environment variables
   
2. **Cookie not persisted** - browser blocking third-party cookies
   - Fix: Already handled by `SameSite=None; Secure`

3. **CORS credentials not enabled**
   - Fix: Already handled by `credentials: true` in CORS config

### Issue 5: "Cannot set cookie on cross-origin request"
**Symptom:** Browser blocks cookie in DevTools console

**Fix:**
- This is already handled by `SameSite=None; Secure` 
- Verify both are present in Set-Cookie header
- Check browser isn't in strict privacy mode

---

## 📋 Pre-Deployment Checklist

Before deploying to production, verify:

- [ ] `NODE_ENV=production` set in Render
- [ ] `FRONTEND_URL=https://trip-verse-frontend.vercel.app` set in Render
- [ ] `NEXT_PUBLIC_API_URL=https://tripverse-backend-ztsz.onrender.com` set in Vercel
- [ ] `JWT_SECRET` is a strong random string (not the example value)
- [ ] All other API keys are set (Cloudinary, Google, Duffel)
- [ ] Database URLs are correct (connection pooling for DATABASE_URL)
- [ ] Backend logs show `Environment: production`
- [ ] Backend logs show correct CORS origins
- [ ] Frontend can access backend health endpoint
- [ ] Login sets cookie with `Secure; SameSite=None`
- [ ] Subsequent requests include cookie in request headers

---

## 🚀 Quick Fix Commands

### Commit and push updated auth controller:
```bash
cd TripVerse-Backend
git add src/auth/auth.controller.ts
git commit -m "Fix production cookie configuration"
git push origin render
```

### Force redeploy on Render (if auto-deploy enabled):
- Push will trigger automatic deployment
- Check logs in Render dashboard

### Redeploy on Vercel:
- Go to Vercel Dashboard → Deployments
- Click "Redeploy" on latest deployment

---

## 📞 Support Resources

**Backend Logs:** https://dashboard.render.com → Your Service → Logs
**Frontend Logs:** https://vercel.com/dashboard → Your Project → Deployments → Select Deployment → View Function Logs
**Browser DevTools:** F12 → Network tab → Look for Set-Cookie in response headers
**Cookie Inspector:** F12 → Application tab → Cookies → Check tripverse-backend-ztsz.onrender.com

---

## ✨ What Changed

Updated `auth.controller.ts`:
- Enhanced cookie debugging logs
- Removed TypeScript const assertion for better compatibility
- Ensured `sameSite` is correctly set as string literal
- Added detailed logging for production environment detection
- Made logout cookie clearing match production settings

The code now properly sets:
- **Production:** `SameSite=None; Secure; HttpOnly` (allows cross-domain)
- **Development:** `SameSite=Lax; HttpOnly` (localhost only)
