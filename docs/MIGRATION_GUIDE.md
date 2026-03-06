# TripVerse Database Migration & Deployment Guide

## Overview

This guide covers the deployment of the dual-mode car booking system (RENTAL + RIDE_HAILING) with zero-downtime migration strategy.

---

## Pre-Migration Checklist

### 1. Backup Production Database

```bash
# PostgreSQL backup
pg_dump -h $DB_HOST -U $DB_USER -d tripverse_production > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
pg_restore --list backup_*.sql | head -20
```

### 2. Verify Staging Environment

```bash
# Clone production data to staging
pg_dump -h $PROD_DB_HOST -U $DB_USER tripverse_production | \
  psql -h $STAGING_DB_HOST -U $DB_USER tripverse_staging

# Verify data
psql -h $STAGING_DB_HOST -c "SELECT COUNT(*) FROM \"CarBooking\";"
```

---

## Migration Steps

### Step 1: Deploy Schema Migration (Zero Downtime)

The migration adds new columns with defaults, so existing queries continue working.

```bash
cd TripVerse-Backend

# Generate migration (if not already done)
npx prisma migrate dev --name "add_ride_hailing_support"

# Deploy to staging first
DATABASE_URL=$STAGING_DB_URL npx prisma migrate deploy

# Verify on staging
DATABASE_URL=$STAGING_DB_URL npx prisma db pull
```

### Step 2: Migration SQL Reference

```sql
-- This migration is additive and non-breaking

-- 1. Create BookingType enum
CREATE TYPE "BookingType" AS ENUM ('RENTAL', 'RIDE_HAILING');

-- 2. Add fields to Car table (nullable or with defaults)
ALTER TABLE "Car" ADD COLUMN "available_for_ride_hailing" BOOLEAN DEFAULT false;
ALTER TABLE "Car" ADD COLUMN "current_mode" TEXT DEFAULT 'offline';
ALTER TABLE "Car" ADD COLUMN "base_fare" DECIMAL(10,2);
ALTER TABLE "Car" ADD COLUMN "per_km_rate" DECIMAL(10,2);
ALTER TABLE "Car" ADD COLUMN "per_minute_rate" DECIMAL(10,2);
ALTER TABLE "Car" ADD COLUMN "minimum_fare" DECIMAL(10,2);

-- 3. Add booking_type to CarBooking (default RENTAL for existing)
ALTER TABLE "CarBooking" ADD COLUMN "booking_type" "BookingType" NOT NULL DEFAULT 'RENTAL';
ALTER TABLE "CarBooking" ADD COLUMN "pickup_time" TIMESTAMP;
ALTER TABLE "CarBooking" ADD COLUMN "dropoff_time" TIMESTAMP;
ALTER TABLE "CarBooking" ADD COLUMN "estimated_duration" INTEGER;
ALTER TABLE "CarBooking" ADD COLUMN "surge_multiplier" DECIMAL(3,2);
ALTER TABLE "CarBooking" ADD COLUMN "request_expires_at" TIMESTAMP;

-- 4. Add indexes for performance
CREATE INDEX "CarBooking_booking_type_status_idx" ON "CarBooking"("booking_type", "status");
CREATE INDEX "Car_current_mode_idx" ON "Car"("current_mode");
```

### Step 3: Deploy to Production

```bash
# Set maintenance mode for clarity (optional)
# The migration is non-breaking, so this is optional

# Deploy migration
DATABASE_URL=$PROD_DB_URL npx prisma migrate deploy

# Verify migration
DATABASE_URL=$PROD_DB_URL npx prisma migrate status
```

---

## Post-Migration: Backfill Data

### Backfill Default Ride-Hailing Prices

Run this script to set sensible defaults for existing cars:

```sql
-- Set default ride-hailing prices for all cars
-- These can be customized by drivers later

UPDATE "Car"
SET 
  base_fare = 50,
  per_km_rate = 15,
  per_minute_rate = 2,
  minimum_fare = 100
WHERE base_fare IS NULL;

-- Enable ride-hailing for verified drivers' cars
UPDATE "Car" c
SET available_for_ride_hailing = true
FROM "Driver" d
WHERE c.driver_id = d.id
  AND d.is_verified = true
  AND c.is_active = true;

-- Verify backfill
SELECT 
  COUNT(*) as total_cars,
  COUNT(CASE WHEN available_for_ride_hailing = true THEN 1 END) as ride_hailing_enabled,
  COUNT(CASE WHEN base_fare IS NOT NULL THEN 1 END) as has_pricing
FROM "Car";
```

### Verify Existing Bookings

```sql
-- All existing bookings should have booking_type = RENTAL
SELECT booking_type, COUNT(*) 
FROM "CarBooking" 
GROUP BY booking_type;

-- Should show:
-- booking_type | count
-- RENTAL       | <all existing bookings>
```

---

## Rollback Plan

### If Issues Occur

```bash
# 1. Immediate: Disable new features via environment variable
FEATURE_RIDE_HAILING_ENABLED=false

# 2. If needed: Rollback migration
npx prisma migrate resolve --rolled-back "add_ride_hailing_support"

# 3. Manual rollback SQL (if needed)
psql -h $PROD_DB_HOST -d tripverse_production << 'EOF'
-- Remove new columns (data will be lost)
ALTER TABLE "Car" DROP COLUMN IF EXISTS available_for_ride_hailing;
ALTER TABLE "Car" DROP COLUMN IF EXISTS current_mode;
ALTER TABLE "Car" DROP COLUMN IF EXISTS base_fare;
ALTER TABLE "Car" DROP COLUMN IF EXISTS per_km_rate;
ALTER TABLE "Car" DROP COLUMN IF EXISTS per_minute_rate;
ALTER TABLE "Car" DROP COLUMN IF EXISTS minimum_fare;

ALTER TABLE "CarBooking" DROP COLUMN IF EXISTS booking_type;
ALTER TABLE "CarBooking" DROP COLUMN IF EXISTS pickup_time;
ALTER TABLE "CarBooking" DROP COLUMN IF EXISTS dropoff_time;
ALTER TABLE "CarBooking" DROP COLUMN IF EXISTS estimated_duration;
ALTER TABLE "CarBooking" DROP COLUMN IF EXISTS surge_multiplier;
ALTER TABLE "CarBooking" DROP COLUMN IF EXISTS request_expires_at;

DROP TYPE IF EXISTS "BookingType";
EOF
```

---

## Verification Steps

### 1. Data Integrity Check

```bash
# Use the admin API endpoint
curl -X GET "https://api.tripverse.pk/admin/migration/verify" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Expected response:
```json
{
  "success": true,
  "checks": [
    { "check": "All bookings have booking_type", "passed": true },
    { "check": "Rental bookings have dates", "passed": true },
    { "check": "Ride-hailing cars have pricing", "passed": true }
  ],
  "summary": {
    "total_bookings": 1500,
    "rental_bookings": 1500,
    "ride_hailing_bookings": 0,
    "cars_with_ride_hailing": 85,
    "drivers_verified": 42
  }
}
```

### 2. Functional Testing

```bash
# Test ride-hailing price calculation
curl -X POST "https://api.tripverse.pk/cars/1/calculate-price" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_location": "Clifton, Karachi",
    "dropoff_location": "Gulshan, Karachi"
  }'

# Test rental price calculation
curl -X POST "https://api.tripverse.pk/cars/2/calculate-price" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_location": "Karachi",
    "dropoff_location": "Lahore",
    "start_date": "2026-03-10",
    "end_date": "2026-03-13"
  }'
```

### 3. Performance Testing

```bash
# Load test the search endpoint
artillery quick --count 100 --num 50 \
  "https://api.tripverse.pk/cars/search?booking_type=RIDE_HAILING"
```

Expected: < 500ms p95 response time

---

## Monitoring Setup

### Key Metrics to Track

| Metric | Alert Threshold |
|--------|-----------------|
| Ride-hailing bookings/hour | Trending upward |
| Rental bookings/hour | No significant drop |
| Price calculation errors | < 1% |
| Driver mode switches/day | Monitor for patterns |
| Request timeout rate | < 5% |

### Grafana Dashboard Queries

```sql
-- Bookings by type (last 24h)
SELECT 
  date_trunc('hour', created_at) as hour,
  booking_type,
  COUNT(*) as bookings
FROM "CarBooking"
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1, 2
ORDER BY 1;

-- Revenue by type
SELECT 
  booking_type,
  SUM(total_amount) as revenue,
  SUM(platform_fee) as platform_fees
FROM "CarBooking"
WHERE status = 'COMPLETED'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY booking_type;

-- Driver mode distribution
SELECT 
  current_mode,
  COUNT(*) as cars
FROM "Car"
WHERE is_active = true
GROUP BY current_mode;
```

---

## Staged Rollout (Optional)

### Phase 1: Internal Testing (Day 1-3)
- Deploy to staging
- Internal team testing
- Fix any issues

### Phase 2: Beta Users (Day 4-7)
- Enable for 10% of users
- Monitor metrics closely
- Gather feedback

### Phase 3: Gradual Rollout (Week 2)
- 25% → 50% → 75% → 100%
- One day between each increment
- Rollback if issues arise

### Phase 4: Full Release (Week 3)
- Feature fully enabled
- Remove feature flags
- Documentation published

---

## Support Contacts

| Role | Contact |
|------|---------|
| Database Admin | dba@tripverse.pk |
| DevOps Lead | devops@tripverse.pk |
| Backend Lead | backend@tripverse.pk |
| On-Call Engineer | oncall@tripverse.pk |

---

## Appendix: Environment Variables

```bash
# Feature Flags
FEATURE_RIDE_HAILING_ENABLED=true
FEATURE_SURGE_PRICING_ENABLED=true

# Timeouts
RIDE_HAILING_REQUEST_TIMEOUT_MS=120000  # 2 minutes

# Pricing Defaults
DEFAULT_BASE_FARE=50
DEFAULT_PER_KM_RATE=15
DEFAULT_PER_MINUTE_RATE=2
DEFAULT_MINIMUM_FARE=100
DEFAULT_PLATFORM_FEE_RIDE_HAILING=0.15
DEFAULT_PLATFORM_FEE_RENTAL=0.05
```
