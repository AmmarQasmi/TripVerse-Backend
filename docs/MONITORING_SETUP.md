# TripVerse Car Booking System - Monitoring Setup

Production monitoring guide for the dual-mode (RENTAL + RIDE_HAILING) car booking system.

---

## Table of Contents

1. [Key Metrics](#key-metrics)
2. [Health Checks](#health-checks)
3. [Database Monitoring](#database-monitoring)
4. [API Performance](#api-performance)
5. [Alert Configuration](#alert-configuration)
6. [Logging Best Practices](#logging-best-practices)
7. [Dashboard Queries](#dashboard-queries)

---

## Key Metrics

### Business Metrics

| Metric | Description | Target | Alert Threshold |
|--------|-------------|--------|-----------------|
| Bookings per hour | Total new bookings created | - | < 10 during peak hours |
| Ride-hailing conversion | Search → Booking rate | > 15% | < 5% |
| Average fare | Mean fare per booking type | - | Deviation > 30% |
| Driver acceptance rate | Accepted / Total assigned | > 80% | < 60% |
| Cancellation rate | Cancelled / Total bookings | < 10% | > 20% |

### Technical Metrics

| Metric | Description | Target | Alert Threshold |
|--------|-------------|--------|-----------------|
| API response time (p95) | 95th percentile latency | < 500ms | > 2000ms |
| Google Places API calls | Requests per minute | - | Rate limit warning at 80% |
| Database query time | Avg query execution | < 100ms | > 500ms |
| Error rate (5xx) | Server errors / Total requests | < 0.1% | > 1% |
| WebSocket connections | Active driver connections | - | Sudden drop > 50% |

---

## Health Checks

### Basic Health Endpoint

```typescript
// Add to cars.controller.ts or create dedicated health.controller.ts
@Get('health')
async healthCheck() {
  const prismaOk = await this.checkDatabaseConnection();
  const googleApiOk = await this.checkGooglePlacesApi();
  
  return {
    status: prismaOk && googleApiOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: prismaOk ? 'ok' : 'error',
      googlePlaces: googleApiOk ? 'ok' : 'error',
      featureFlags: {
        rideHailing: process.env.FEATURE_RIDE_HAILING_ENABLED === 'true',
        surgePricing: process.env.FEATURE_SURGE_PRICING_ENABLED === 'true',
      },
    },
  };
}
```

### Deep Health Check

```typescript
@Get('health/deep')
@UseGuards(JwtAuthGuard) // Admin only
async deepHealthCheck() {
  const startTime = Date.now();
  
  // Test database read
  const dbReadTime = await this.timeOperation(
    () => this.prisma.carBooking.count()
  );
  
  // Test database write (create + delete test record)
  const dbWriteTime = await this.timeOperation(
    () => this.testDbWrite()
  );
  
  // Test Google Places API
  const googleTime = await this.timeOperation(
    () => this.googlePlaces.searchCities('Mumbai')
  );
  
  return {
    status: 'healthy',
    totalCheckTime: Date.now() - startTime,
    checks: {
      database: {
        readLatency: dbReadTime,
        writeLatency: dbWriteTime,
        status: dbReadTime < 500 ? 'ok' : 'slow',
      },
      googlePlaces: {
        latency: googleTime,
        status: googleTime < 1000 ? 'ok' : 'slow',
      },
    },
  };
}
```

---

## Database Monitoring

### Connection Pool Status

```sql
-- PostgreSQL connection monitoring
SELECT 
  state,
  COUNT(*) as connection_count,
  MAX(EXTRACT(EPOCH FROM (NOW() - state_change))) as max_idle_time_seconds
FROM pg_stat_activity 
WHERE datname = current_database()
GROUP BY state;
```

### Slow Query Detection

```sql
-- Enable slow query logging in PostgreSQL
ALTER SYSTEM SET log_min_duration_statement = 500; -- Log queries > 500ms
SELECT pg_reload_conf();

-- View recent slow queries
SELECT 
  query,
  calls,
  total_time / calls as avg_time_ms,
  rows / calls as avg_rows
FROM pg_stat_statements 
WHERE total_time / calls > 100
ORDER BY total_time DESC 
LIMIT 20;
```

### Car Booking Table Size Monitoring

```sql
-- Monitor table growth
SELECT 
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  pg_size_pretty(pg_indexes_size(relid)) as index_size,
  n_live_tup as row_count
FROM pg_stat_user_tables 
WHERE relname IN ('CarBooking', 'Car', 'User')
ORDER BY pg_total_relation_size(relid) DESC;
```

---

## API Performance

### Prometheus Metrics Setup (Optional)

```typescript
// Install: npm install prom-client @willsoto/nestjs-prometheus

// metrics.module.ts
import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { 
  makeCounterProvider, 
  makeHistogramProvider 
} from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [
    makeCounterProvider({
      name: 'car_bookings_total',
      help: 'Total car bookings created',
      labelNames: ['bookingType', 'status'],
    }),
    makeHistogramProvider({
      name: 'car_booking_fare_rupees',
      help: 'Distribution of booking fares',
      labelNames: ['bookingType'],
      buckets: [100, 500, 1000, 2500, 5000, 10000, 25000],
    }),
    makeHistogramProvider({
      name: 'api_request_duration_seconds',
      help: 'API request duration',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5],
    }),
  ],
})
export class MetricsModule {}
```

### Request Logging Interceptor

```typescript
// logging.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        const logLevel = duration > 1000 ? 'WARN' : 'INFO';
        
        console.log(JSON.stringify({
          level: logLevel,
          type: 'http_request',
          method,
          url,
          duration,
          timestamp: new Date().toISOString(),
          // Don't log sensitive body data
          hasBody: !!body && Object.keys(body).length > 0,
        }));
      }),
    );
  }
}
```

---

## Alert Configuration

### Critical Alerts (PagerDuty/OpsGenie)

| Alert | Condition | Priority |
|-------|-----------|----------|
| API Down | Health check fails 3x in 5 min | P1 |
| Database unreachable | Connection errors > 10 in 1 min | P1 |
| Payment failures spike | Failure rate > 10% in 15 min | P1 |
| Error rate spike | 5xx > 5% of requests | P1 |

### Warning Alerts (Slack/Email)

| Alert | Condition | Priority |
|-------|-----------|----------|
| High latency | P95 > 2s for 10 min | P2 |
| Google API quota | > 80% of daily limit | P2 |
| Low driver acceptance | < 50% for 1 hour | P2 |
| High cancellation rate | > 25% for 1 hour | P2 |
| Feature flag changes | Any flag toggled | P3 |

### Example Slack Webhook Alert

```typescript
// alert.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AlertService {
  private slackWebhook: string;

  constructor(private config: ConfigService) {
    this.slackWebhook = this.config.get('SLACK_WEBHOOK_URL');
  }

  async sendAlert(title: string, message: string, severity: 'critical' | 'warning' | 'info') {
    const color = {
      critical: '#ff0000',
      warning: '#ffaa00',
      info: '#0088ff',
    }[severity];

    await fetch(this.slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachments: [{
          color,
          title: `[${severity.toUpperCase()}] ${title}`,
          text: message,
          footer: 'TripVerse Monitoring',
          ts: Math.floor(Date.now() / 1000),
        }],
      }),
    });
  }
}
```

---

## Logging Best Practices

### Structured Logging Format

```typescript
// All logs should use this format
interface LogEntry {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  type: string;
  message: string;
  timestamp: string;
  correlationId?: string;
  userId?: number;
  bookingId?: number;
  bookingType?: 'RENTAL' | 'RIDE_HAILING';
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// Example usage
function logBookingCreated(booking: CarBooking) {
  console.log(JSON.stringify({
    level: 'INFO',
    type: 'booking_created',
    message: `New ${booking.bookingType} booking created`,
    timestamp: new Date().toISOString(),
    userId: booking.clientId,
    bookingId: booking.id,
    bookingType: booking.bookingType,
    fare: booking.totalPrice,
  }));
}
```

### Error Logging

```typescript
// Always log errors with context
try {
  await this.createBooking(data);
} catch (error) {
  console.error(JSON.stringify({
    level: 'ERROR',
    type: 'booking_creation_failed',
    message: 'Failed to create car booking',
    timestamp: new Date().toISOString(),
    userId: data.clientId,
    bookingType: data.bookingType,
    error: {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    },
  }));
  throw error;
}
```

---

## Dashboard Queries

### Real-Time Booking Volume

```sql
-- Bookings in last hour by type (for Grafana/Dashboard)
SELECT 
  DATE_TRUNC('minute', "createdAt") as minute,
  "bookingType",
  COUNT(*) as bookings
FROM "CarBooking"
WHERE "createdAt" > NOW() - INTERVAL '1 hour'
GROUP BY minute, "bookingType"
ORDER BY minute DESC;
```

### Revenue Dashboard

```sql
-- Hourly revenue breakdown
SELECT 
  DATE_TRUNC('hour', "createdAt") as hour,
  "bookingType",
  COUNT(*) as total_bookings,
  SUM("totalPrice") as total_revenue,
  AVG("totalPrice") as avg_fare,
  SUM("platformFee") as platform_earnings
FROM "CarBooking"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
  AND status IN ('completed', 'confirmed')
GROUP BY hour, "bookingType"
ORDER BY hour DESC;
```

### Driver Performance

```sql
-- Driver acceptance metrics today
SELECT 
  d.id,
  d.name,
  COUNT(CASE WHEN cb.status = 'confirmed' THEN 1 END) as accepted,
  COUNT(CASE WHEN cb.status = 'cancelled' AND cb."cancelledBy" = 'DRIVER' THEN 1 END) as rejected,
  AVG(cb."totalPrice") as avg_fare,
  AVG(EXTRACT(EPOCH FROM (cb."confirmedAt" - cb."createdAt"))/60) as avg_response_minutes
FROM "Driver" d
LEFT JOIN "Car" c ON c."driverId" = d.id
LEFT JOIN "CarBooking" cb ON cb."carId" = c.id 
  AND cb."createdAt" > NOW() - INTERVAL '24 hours'
WHERE d."isRideHailingMode" = true
GROUP BY d.id, d.name
ORDER BY accepted DESC;
```

### Surge Pricing Activity

```sql
-- When surge pricing was applied
SELECT 
  DATE_TRUNC('hour', "createdAt") as hour,
  AVG("surgeMultiplier") as avg_surge,
  MAX("surgeMultiplier") as max_surge,
  COUNT(*) FILTER (WHERE "surgeMultiplier" > 1) as surge_bookings,
  COUNT(*) as total_bookings
FROM "CarBooking"
WHERE "bookingType" = 'RIDE_HAILING'
  AND "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY hour
HAVING MAX("surgeMultiplier") > 1
ORDER BY hour DESC;
```

### Conversion Funnel

```sql
-- Search to booking conversion (requires analytics logging)
WITH searches AS (
  SELECT COUNT(DISTINCT session_id) as search_sessions
  FROM analytics_events
  WHERE event_type = 'car_search'
    AND timestamp > NOW() - INTERVAL '24 hours'
),
bookings AS (
  SELECT COUNT(*) as completed_bookings
  FROM "CarBooking"
  WHERE "createdAt" > NOW() - INTERVAL '24 hours'
)
SELECT 
  s.search_sessions,
  b.completed_bookings,
  ROUND(b.completed_bookings::decimal / NULLIF(s.search_sessions, 0) * 100, 2) as conversion_rate
FROM searches s, bookings b;
```

---

## Environment Variables for Monitoring

Add these to your `.env.production`:

```bash
# Feature Flags (for gradual rollout monitoring)
FEATURE_RIDE_HAILING_ENABLED=true
FEATURE_RIDE_HAILING_ROLLOUT_PERCENTAGE=100
FEATURE_SURGE_PRICING_ENABLED=true
FEATURE_METRO_CITIES_ENABLED=true

# Monitoring
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true

# Performance
GOOGLE_PLACES_CACHE_TTL_SECONDS=86400
MAX_CONCURRENT_GOOGLE_API_CALLS=10
```

---

## Quick Health Check Commands

```bash
# Check API health
curl https://your-api.com/api/v1/cars/health

# Check database connectivity
curl https://your-api.com/api/v1/cars/health/deep

# View recent logs (Render)
render logs your-service-name --tail 100

# Check feature flag status
curl https://your-api.com/api/v1/cars/feature-flags/status
```

---

## Runbook: Common Issues

### Issue: High Google API Latency

1. Check Google Cloud Console for quota status
2. Verify cache is working: `redis-cli GET "places:search:Mumbai"`
3. Review cache hit rate in logs
4. Temporarily increase cache TTL if needed

### Issue: Low Driver Acceptance Rate

1. Check WebSocket connection count
2. Review driver app push notification delivery
3. Query recent driver rejection reasons
4. Check if surge pricing is too low to attract drivers

### Issue: Payment Failures

1. Check Stripe dashboard for error patterns
2. Verify webhook endpoint is responding
3. Review recent payment failure logs
4. Check if card decline rate is unusually high

---

*Last updated: Phase 11 implementation*
