# Authentication System

This authentication system provides JWT-based authentication with role-based access control (RBAC).

## Features

- **JWT Token Authentication**: Secure token-based authentication
- **Password Hashing**: Passwords are hashed using bcrypt (salt rounds: 10)
- **Role-Based Access Control**: Three user roles (admin, driver, client)
- **Admin Bypass**: Admins can access all endpoints regardless of role restrictions
- **Token Expiration**: Configurable JWT token expiration (default: 7 days)

## API Endpoints

### Public Endpoints (No Authentication Required)

#### 1. Signup
```
POST /api/auth/signup
```

**Request Body:**
```json
{
  "full_name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123",
  "role": "client",
  "region": "North America"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "john@example.com",
    "full_name": "John Doe",
    "role": "client",
    "region": "North America"
  }
}
```

#### 2. Login
```
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "john@example.com",
    "full_name": "John Doe",
    "role": "client",
    "region": "North America"
  }
}
```

#### 3. Logout
```
POST /api/auth/logout
```

**Response:**
```json
{
  "message": "Logged out successfully. Please remove the token from client storage."
}
```

**Note:** With JWT, logout is handled on the client side by removing the token from storage.

### Protected Endpoints (Authentication Required)

#### 4. Get Current User Profile
```
GET /api/auth/me
```

**Headers:**
```
Authorization: Bearer <your_jwt_token>
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "email": "john@example.com",
    "full_name": "John Doe",
    "role": "client",
    "region": "North America"
  }
}
```

## User Roles

The system supports three roles defined in the Prisma schema:

1. **client**: Regular users who can book hotels and cars
2. **driver**: Users who provide car services
3. **admin**: System administrators with full access

### Role Hierarchy

- **Admin**: Can access ALL endpoints, bypassing all role restrictions
- **Driver**: Can access driver-specific endpoints
- **Client**: Can access client-specific endpoints

## Usage Examples

### Protecting Routes with Authentication

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('protected')
export class ProtectedController {
  @Get('data')
  @UseGuards(JwtAuthGuard)
  getData(@CurrentUser() user: any) {
    return {
      message: 'This is protected data',
      userId: user.id,
    };
  }
}
```

### Protecting Routes with Role-Based Access

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('drivers')
export class DriversController {
  // Only drivers (and admins) can access this
  @Get('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.driver)
  getProfile(@CurrentUser() user: any) {
    return { message: 'Driver profile', user };
  }

  // Only admins can access this
  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  adminOnly(@CurrentUser() user: any) {
    return { message: 'Admin only endpoint' };
  }

  // Multiple roles allowed
  @Get('multi-role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.driver, Role.client)
  multiRole(@CurrentUser() user: any) {
    return { message: 'Drivers and clients can access this' };
  }
}
```

### Getting Current User Information

```typescript
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Get('my-bookings')
@UseGuards(JwtAuthGuard)
getMyBookings(@CurrentUser() user: any) {
  // user object contains: id, email, full_name, role, region
  return this.bookingsService.findByUserId(user.id);
}
```

## Environment Variables

Add these to your `.env` file:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/tripverse

# Server
PORT=3000
```

## Security Best Practices

1. **Always use HTTPS in production** to prevent token interception
2. **Change the JWT_SECRET** to a strong, random value in production
3. **Keep tokens secure** on the client side (use httpOnly cookies or secure storage)
4. **Implement token refresh** for better security (optional enhancement)
5. **Validate all inputs** using DTOs and class-validator
6. **Rate limiting** should be implemented for auth endpoints

## Password Requirements

- Minimum length: 6 characters
- Passwords are hashed using bcrypt with 10 salt rounds
- Plain passwords are never stored in the database

## Token Structure

JWT tokens contain the following payload:

```json
{
  "sub": 1,           // User ID
  "email": "user@example.com",
  "role": "client",
  "iat": 1234567890,  // Issued at
  "exp": 1234567890   // Expiration time
}
```

## Error Responses

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Access denied. Required roles: driver. Your role: client",
  "error": "Forbidden"
}
```

### 409 Conflict
```json
{
  "statusCode": 409,
  "message": "User with this email already exists",
  "error": "Conflict"
}
```

## Client Integration

### Using Fetch API

```javascript
// Signup
const signup = async () => {
  const response = await fetch('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
      role: 'client',
      region: 'North America'
    })
  });
  const data = await response.json();
  localStorage.setItem('token', data.access_token);
  return data;
};

// Login
const login = async () => {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'john@example.com',
      password: 'password123'
    })
  });
  const data = await response.json();
  localStorage.setItem('token', data.access_token);
  return data;
};

// Authenticated Request
const getProfile = async () => {
  const token = localStorage.getItem('token');
  const response = await fetch('http://localhost:3000/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return response.json();
};

// Logout
const logout = () => {
  localStorage.removeItem('token');
};
```

### Using Axios

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api'
});

// Add token to all requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Signup
const signup = (data) => api.post('/auth/signup', data);

// Login
const login = (data) => api.post('/auth/login', data);

// Get profile
const getProfile = () => api.get('/auth/me');
```

## Testing with cURL

```bash
# Signup
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "role": "client",
    "region": "North America"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'

# Get profile (replace TOKEN with actual token)
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer TOKEN"
```

## Next Steps

1. Implement token refresh mechanism for enhanced security
2. Add email verification for new signups
3. Implement password reset functionality
4. Add rate limiting to prevent brute force attacks
5. Implement token blacklisting for logout
6. Add multi-factor authentication (2FA)

