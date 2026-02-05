# TripVerse Backend - Render Deployment Guide

## 🚀 Quick Deploy to Render

### Step 1: Prepare Your Repository
1. Commit all changes to Git:
```bash
cd TripVerse-Backend
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### Step 2: Create Render Account
1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Authorize Render to access your repositories

### Step 3: Deploy Backend
1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `tripverse-backend`
   - **Region**: Singapore (or closest to you)
   - **Branch**: `main`
   - **Root Directory**: `TripVerse-Backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build && npx prisma generate`
   - **Start Command**: `npm start`
   - **Plan**: Free

### Step 4: Add Environment Variables
In Render dashboard, add these environment variables:

```env
NODE_ENV=production
DATABASE_URL=your-supabase-database-url-from-dashboard
DIRECT_URL=your-supabase-direct-url-from-dashboard
JWT_SECRET=your-super-secret-production-jwt-key-change-this
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://your-frontend-domain.vercel.app
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
GOOGLE_VISION_API_KEY=your-google-vision-api-key
GOOGLE_PLACES_API_KEY=your-google-places-api-key
GOOGLE_DISTANCE_MATRIX_API_KEY=your-google-distance-matrix-api-key
DUFFEL_API_KEY=your-duffel-api-key
DUFFEL_API_URL=https://api.duffel.com
```

**⚠️ IMPORTANT**:
- Change `JWT_SECRET` to a strong random string
- Update `FRONTEND_URL` with your actual frontend URL
- If deploying multiple frontends, use comma-separated: `https://app1.com,https://app2.com`

### Step 5: Deploy
1. Click **"Create Web Service"**
2. Wait 5-10 minutes for build
3. Your backend will be live at: `https://tripverse-backend.onrender.com`

### Step 6: Update Postman Collection
Your Render URL will be: `https://tripverse-backend.onrender.com`

Update the environment variable in Postman:
```
base_url = https://tripverse-backend.onrender.com
```

### Step 7: Run Database Migrations (First Deploy Only)
After first deployment, run migrations:
1. Go to Render Dashboard → Your Service
2. Click **"Shell"** tab
3. Run: `npx prisma migrate deploy`

## 🔍 Troubleshooting

### Build Fails
- Check build logs in Render dashboard
- Verify all dependencies are in `package.json`
- Ensure `postinstall` script runs `prisma generate`

### Database Connection Issues
- Verify `DATABASE_URL` and `DIRECT_URL` are correct
- Check Supabase connection pooler settings
- Ensure database allows connections from Render IPs

### CORS Errors
- Verify `FRONTEND_URL` matches your frontend domain exactly
- Include protocol: `https://` not `www.`
- For multiple origins, use comma-separated list

### Cookie Issues
- In production, cookies require HTTPS
- `sameSite: 'none'` and `secure: true` are automatically set in production
- Frontend must use `credentials: true` in fetch/axios

### 502 Bad Gateway
- Check that port binding uses `0.0.0.0` (already configured)
- Verify `PORT` environment variable is not set (Render auto-assigns)
- Check logs for startup errors

## 📊 Monitoring

### View Logs
```bash
# Real-time logs in Render dashboard
Dashboard → Your Service → Logs tab
```

### Health Check
```bash
curl https://tripverse-backend.onrender.com/auth/health
```

### Check Cron Jobs
Cron jobs will run automatically:
- Driver suspensions: Daily at 5:00 AM
- Hotel booking cleanup: Every 15 minutes

## 🔄 Updates

After code changes:
```bash
git add .
git commit -m "Your changes"
git push origin main
```

Render auto-deploys on push to `main` branch.

## 💰 Cost Optimization

**Free Tier Limitations**:
- Spins down after 15 minutes of inactivity
- First request after spin-down takes 30-60 seconds
- 750 hours/month free

**To Prevent Spin Down** (Optional):
- Use [cron-job.org](https://cron-job.org) to ping health endpoint every 10 minutes
- Ping URL: `https://tripverse-backend.onrender.com/auth/health`

**Upgrade to Paid** ($7/month):
- No spin-down
- Always-on instance
- Better performance

## 🎯 Production Checklist

- [ ] Strong JWT_SECRET set
- [ ] FRONTEND_URL configured correctly
- [ ] Database migrations deployed
- [ ] All API keys added to environment
- [ ] Health check returns 200
- [ ] Cron jobs running (check logs)
- [ ] CORS working with frontend
- [ ] Cookie authentication working
- [ ] Postman collection updated with Render URL

## 🔗 Useful Links

- **Render Dashboard**: https://dashboard.render.com
- **Render Docs**: https://render.com/docs
- **Supabase Dashboard**: https://supabase.com/dashboard
- **Your Backend URL**: `https://tripverse-backend.onrender.com` (after deployment)
