# TripVerse Car Module API Documentation

## Overview

The TripVerse Car Module supports two booking types:
- **RENTAL**: Multi-day car rentals for intercity travel
- **RIDE_HAILING**: On-demand rides within metropolitan areas

---

## Authentication

All endpoints require JWT authentication via Bearer token:
```
Authorization: Bearer <jwt_token>
```

---

## Endpoints

### 1. Search Available Cars

**GET** `/cars/search`

Search for available cars with optional filters.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `city_id` | number | No | Filter by city ID |
| `location_query` | string | No | Search by location name |
| `start_date` | ISO date | No | Rental start date |
| `end_date` | ISO date | No | Rental end date |
| `seats` | number | No | Minimum seats required |
| `transmission` | string | No | `automatic` or `manual` |
| `fuel_type` | string | No | `petrol`, `diesel`, `electric`, `hybrid` |
| `min_price` | number | No | Minimum price per day |
| `max_price` | number | No | Maximum price per day |
| `booking_type` | string | No | `RENTAL` or `RIDE_HAILING` |

#### Response
```json
{
  "cars": [
    {
      "id": 1,
      "driver_id": 5,
      "license_plate": "ABC-123",
      "year": 2022,
      "seats": 5,
      "fuel_type": "petrol",
      "transmission": "automatic",
      "price_per_day": "5000.00",
      "is_available": true,
      "available_for_rental": true,
      "available_for_ride_hailing": true,
      "current_mode": "ride_hailing",
      "ride_hailing_pricing": {
        "base_fare": "50.00",
        "per_km_rate": "15.00",
        "per_minute_rate": "2.00",
        "minimum_fare": "100.00"
      },
      "car_model": {
        "make": "Toyota",
        "model": "Corolla"
      },
      "city": {
        "id": 1,
        "name": "Karachi"
      }
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

### 2. Calculate Price

**POST** `/cars/:carId/calculate-price`

Calculate booking price for a specific car.

#### Request Body
```json
{
  "pickup_location": "Clifton, Karachi",
  "dropoff_location": "Gulshan, Karachi",
  "booking_type": "RIDE_HAILING",
  "scheduled_pickup": "2026-03-06T09:00:00Z",
  "estimated_distance": 15
}
```

#### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pickup_location` | string | Yes | Pickup address |
| `dropoff_location` | string | Yes | Dropoff address |
| `booking_type` | string | No | `RENTAL` or `RIDE_HAILING` (auto-detected if omitted) |
| `start_date` | ISO date | RENTAL only | Rental start date |
| `end_date` | ISO date | RENTAL only | Rental end date |
| `scheduled_pickup` | ISO date | RIDE_HAILING | Pickup time |
| `estimated_distance` | number | No | Override distance (km) |

#### Response - RIDE_HAILING
```json
{
  "car_id": 1,
  "driver_id": 5,
  "pickup_location": "Clifton, Karachi",
  "dropoff_location": "Gulshan, Karachi",
  "booking_type": "RIDE_HAILING",
  "detected_booking_type": "RIDE_HAILING",
  "estimated_distance": 15,
  "estimated_duration": 35,
  "surge_multiplier": 1.3,
  "scheduled_pickup": "2026-03-06T09:00:00.000Z",
  "detected_cities": {
    "pickup_city_id": 1,
    "pickup_city_name": "Karachi",
    "dropoff_city_id": 1,
    "dropoff_city_name": "Karachi"
  },
  "pricing_breakdown": {
    "base_price": 50,
    "distance_price": 225,
    "time_price": 70,
    "surge_multiplier": 1.3,
    "subtotal": 345,
    "total_amount": 449,
    "driver_earnings": 382,
    "platform_fee": 67,
    "platform_fee_percentage": 15
  }
}
```

#### Response - RENTAL
```json
{
  "car_id": 2,
  "driver_id": 5,
  "pickup_location": "Karachi",
  "dropoff_location": "Lahore",
  "booking_type": "RENTAL",
  "detected_booking_type": "RENTAL",
  "trip_duration_days": 3,
  "estimated_distance": 1200,
  "detected_cities": {
    "pickup_city_id": 1,
    "pickup_city_name": "Karachi",
    "dropoff_city_id": 2,
    "dropoff_city_name": "Lahore"
  },
  "pricing_breakdown": {
    "base_price": 15000,
    "distance_price": 6000,
    "subtotal": 21000,
    "total_amount": 19950,
    "driver_earnings": 18953,
    "platform_fee": 997,
    "platform_fee_percentage": 5
  }
}
```

---

### 3. Create Booking

**POST** `/bookings/cars`

Create a new car booking.

#### Request Body - RIDE_HAILING
```json
{
  "car_id": 1,
  "booking_type": "RIDE_HAILING",
  "pickup_location": "Clifton, Karachi",
  "dropoff_location": "Gulshan, Karachi",
  "pickup_time": "2026-03-06T09:00:00Z",
  "total_amount": 449,
  "driver_earnings": 382,
  "platform_fee": 67,
  "estimated_distance": 15,
  "estimated_duration": 35,
  "surge_multiplier": 1.3
}
```

#### Request Body - RENTAL
```json
{
  "car_id": 2,
  "booking_type": "RENTAL",
  "pickup_location": "Karachi Airport",
  "dropoff_location": "Lahore Airport",
  "start_date": "2026-03-10",
  "end_date": "2026-03-13",
  "total_amount": 19950,
  "driver_earnings": 18953,
  "platform_fee": 997,
  "estimated_distance": 1200
}
```

#### Response
```json
{
  "id": 100,
  "booking_type": "RIDE_HAILING",
  "status": "PENDING_DRIVER_ACCEPTANCE",
  "total_amount": "449.00",
  "created_at": "2026-03-06T08:30:00.000Z",
  "request_expires_at": "2026-03-06T08:32:00.000Z"
}
```

---

### 4. Driver Mode Management

#### Switch Driver Mode

**POST** `/cars/driver/mode`

Switch between operating modes.

```json
{
  "mode": "ride_hailing"
}
```

Modes: `offline`, `ride_hailing`, `rental`

#### Get Current Mode

**GET** `/cars/driver/mode`

```json
{
  "mode": "ride_hailing",
  "cars": [
    {
      "id": 1,
      "make": "Toyota",
      "model": "Corolla",
      "current_mode": "ride_hailing",
      "available_for_rental": true,
      "available_for_ride_hailing": true
    }
  ]
}
```

---

### 5. Configure Ride-Hailing Pricing

**PUT** `/cars/:carId/ride-hailing-settings`

Update ride-hailing pricing for a car.

```json
{
  "available_for_ride_hailing": true,
  "base_fare": 50,
  "per_km_rate": 15,
  "per_minute_rate": 2,
  "minimum_fare": 100
}
```

---

### 6. Accept/Reject Booking

**POST** `/bookings/cars/:bookingId/accept`

Accept a pending booking (driver only).

**POST** `/bookings/cars/:bookingId/reject`

Reject a pending booking (driver only).

---

## Fare Calculation Formulas

### Ride-Hailing Formula

```
Base Calculation:
  subtotal = base_fare + (distance × per_km_rate) + (duration × per_minute_rate)

Surge Pricing:
  fare_after_surge = subtotal × surge_multiplier

Final Amount:
  total_amount = MAX(fare_after_surge, minimum_fare)

Earnings Split:
  platform_fee = total_amount × 0.15 (15%)
  driver_earnings = total_amount - platform_fee
```

#### Surge Multiplier Rules
| Condition | Multiplier |
|-----------|------------|
| Weekday 7-9 AM (morning peak) | 1.3x |
| Weekday 5-7 PM (evening peak) | 1.3x |
| Weekend (Saturday/Sunday) | 1.2x |
| All other times | 1.0x |

### Rental Formula

```
Base Calculation:
  trip_days = end_date - start_date (minimum 1 day)
  base_price = trip_days × price_per_day
  distance_price = estimated_distance × 5 (PKR per km)
  subtotal = base_price + distance_price

Platform Fee:
  platform_fee = subtotal × 0.05 (5%)
  
Final Amount:
  total_amount = subtotal - platform_fee (discount to encourage rentals)
  driver_earnings = total_amount × 0.95
```

---

## Booking Status Flow

### Ride-Hailing Status Flow
```
PENDING_DRIVER_ACCEPTANCE (2 min timeout)
    ↓ Driver accepts
ACCEPTED
    ↓ Driver arrives at pickup
IN_PROGRESS
    ↓ Driver completes ride
COMPLETED

    ↓ Timeout or driver rejects
CANCELLED
```

### Rental Status Flow
```
PENDING
    ↓ Driver accepts
CONFIRMED
    ↓ Pickup time arrives
IN_PROGRESS
    ↓ Return completed
COMPLETED
```

---

## Error Codes

| Code | Message | Resolution |
|------|---------|------------|
| 400 | Car not available for ride-hailing | Driver is offline or car not configured |
| 400 | Cannot switch to ride-hailing mode | Active rental booking exists |
| 400 | Date conflict | Car already booked for selected dates |
| 404 | Car not found | Invalid car ID |
| 403 | Driver not verified | Driver verification required |
| 408 | Request timeout | Ride request expired after 2 minutes |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Price calculation | 60 requests/minute |
| Booking creation | 10 requests/minute |
| Search | 100 requests/minute |

---

## Webhooks (Coming Soon)

Subscribe to booking events:
- `booking.created`
- `booking.accepted`
- `booking.completed`
- `booking.cancelled`
