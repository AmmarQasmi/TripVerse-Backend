# Authentication System Setup Guide

This guide will help you set up and configure the complete authentication system for TripVerse Backend.

## ✅ Installation Complete

All required packages have been installed:
- `@nestjs/jwt` - JWT token generation and validation
- `@nestjs/passport` - Passport integration for NestJS
- `passport-jwt` - Passport strategy for JWT
- `bcrypt` - Password hashing
- `class-validator` - DTO validation
- `class-transformer` - Object transformation

## 📋 Required Environment Variables

Create a `.env` file in your project root with the following variables:

```env
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/tripverse

# JWT Configuration
# IMPORTANT: Change this to a strong, random secret in production!
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Server Configuration
PORT=3000
NODE_ENV=development
```

## 🎯 Features Implemented

### 1. **Authentication APIs**
- ✅ `POST /api/auth/signup` - User registration
- ✅ `POST /api/auth/login` - User login
- ✅ `POST /api/auth/logout` - User logout
- ✅ `GET /api/auth/me` - Get current user profile

### 2. **Password Security**
- ✅ Passwords hashed using bcrypt (10 salt rounds)
- ✅ Never stored in plain text
- ✅ Minimum password length: 6 characters

### 3. **JWT Tokenization**
- ✅ Tokens include user ID, email, and role
- ✅ Configurable expiration time (default: 7 days)
- ✅ Automatic validation on protected routes
- ✅ Token sent in response alongside user data

### 4. **Role-Based Access Control**
- ✅ Three roles: `admin`, `driver`, `client`
- ✅ Admin bypass: Admins can access ALL endpoints
- ✅ Driver-specific endpoints
- ✅ Client-specific endpoints
- ✅ Custom guards and decorators

## 🔒 User Roles & Permissions

### Admin
- **Full Access**: Can access ALL endpoints, bypassing all restrictions
- Automatically created in Admin table upon signup
- Use case: System administrators, support staff

### Driver
- **Driver Endpoints**: Can access driver-specific features
- Automatically created in Driver table upon signup
- Use case: Car service providers

### Client
- **Client Endpoints**: Can access client-specific features
- Use case: Regular users booking hotels and cars

## 🚀 Quick Start

### 1. Build the Project
```bash
npm run build
```

### 2. Start the Server
```bash
npm run start:dev
```

### 3. Test the Authentication

#### Signup (Create a new user)
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "role": "client",
    "region": "North America"
  }'
```

#### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

Response will include:
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

#### Access Protected Endpoint
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 📝 How to Use in Your Controllers

### Example 1: Basic Authentication

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('bookings')
export class BookingsController {
  @Get('my-bookings')
  @UseGuards(JwtAuthGuard)
  getMyBookings(@CurrentUser() user: any) {
    // Only authenticated users can access this
    return {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role
    };
  }
}
```

### Example 2: Role-Based Access

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('drivers')
export class DriversController {
  // Only drivers and admins can access
  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.driver)
  getDriverDashboard(@CurrentUser() user: any) {
    return { message: 'Driver dashboard' };
  }

  // Only admins can access
  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  adminOnly(@CurrentUser() user: any) {
    return { message: 'Admin only' };
  }

  // Multiple roles allowed
  @Get('multi-role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.driver, Role.client)
  multiRole(@CurrentUser() user: any) {
    return { message: 'Drivers and clients allowed' };
  }
}
```

### Example 3: Admin Bypass Example

```typescript
// This endpoint requires driver role
@Get('driver-stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.driver)
getDriverStats(@CurrentUser() user: any) {
  // Drivers can access this
  // Admins can also access this (bypass)
  // Clients CANNOT access this (will get 403 Forbidden)
  return { stats: 'driver data' };
}
```

## 🛡️ Security Best Practices

1. **Use Strong JWT Secret**
   - Generate a random string (at least 32 characters)
   - Never commit it to version control
   - Use different secrets for different environments

2. **HTTPS in Production**
   - Always use HTTPS to prevent token interception
   - Configure SSL/TLS certificates

3. **Token Storage (Client-Side)**
   - Use httpOnly cookies (recommended)
   - Or secure localStorage/sessionStorage
   - Never expose tokens in URLs

4. **Rate Limiting**
   - Implement rate limiting on auth endpoints
   - Prevent brute force attacks
   - Consider packages like `@nestjs/throttler`

5. **Input Validation**
   - All DTOs are validated using class-validator
   - Whitelist only expected properties
   - Transform inputs safely

## 📊 Database Schema

When a user signs up, the following happens:

1. **User record created** with hashed password
2. **Role-specific record created**:
   - If role is `driver` → Driver record created
   - If role is `admin` → Admin record created
   - If role is `client` → No additional record

## 🧪 Testing Examples

### Create Admin User
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Admin User",
    "email": "admin@tripverse.com",
    "password": "admin123",
    "role": "admin",
    "region": "Global"
  }'
```

### Create Driver User
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Driver User",
    "email": "driver@tripverse.com",
    "password": "driver123",
    "role": "driver",
    "region": "California"
  }'
```

### Create Client User
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Client User",
    "email": "client@tripverse.com",
    "password": "client123",
    "role": "client",
    "region": "New York"
  }'
```

## 🔍 Troubleshooting

### Issue: "Invalid credentials"
- Check if the email exists in database
- Verify password is correct
- Ensure user was created successfully

### Issue: "Access denied" / 403 Forbidden
- Check if user has the required role
- Verify the @Roles decorator has the correct role
- Remember: Admins bypass all restrictions

### Issue: "Unauthorized" / 401
- Check if token is included in Authorization header
- Verify token format: `Bearer <token>`
- Ensure token hasn't expired
- Check if JWT_SECRET matches

### Issue: Validation errors
- Verify all required fields are provided
- Check field types match DTO requirements
- Ensure email format is valid
- Password must be at least 6 characters

## 📦 Files Created/Modified

### New Files Created:
- `src/auth/dto/signup.dto.ts`
- `src/auth/dto/login.dto.ts`
- `src/auth/dto/auth-response.dto.ts`
- `src/auth/strategies/jwt.strategy.ts`
- `src/common/decorators/current-user.decorator.ts`
- `src/common/decorators/roles.decorator.ts`
- `src/auth/README.md`
- `AUTH_SETUP.md` (this file)

### Modified Files:
- `src/auth/auth.service.ts`
- `src/auth/auth.controller.ts`
- `src/auth/auth.module.ts`
- `src/users/users.service.ts`
- `src/users/users.module.ts`
- `src/common/guards/auth.guard.ts`
- `src/common/guards/roles.guard.ts`
- `src/main.ts`
- `src/drivers/drivers.controller.ts` (example)
- `src/admin/admin.controller.ts` (example)

## 🎓 Additional Resources

- [NestJS Authentication Docs](https://docs.nestjs.com/security/authentication)
- [JWT.io](https://jwt.io/) - Decode and verify JWT tokens
- [Bcrypt Documentation](https://www.npmjs.com/package/bcrypt)
- [Passport.js Documentation](http://www.passportjs.org/)

## 🚧 Future Enhancements (Optional)

1. **Token Refresh** - Implement refresh tokens for better security
2. **Email Verification** - Verify email addresses after signup
3. **Password Reset** - Allow users to reset forgotten passwords
4. **2FA** - Two-factor authentication for enhanced security
5. **Token Blacklist** - Invalidate tokens on logout
6. **Session Management** - Track active sessions
7. **OAuth Integration** - Google, Facebook, GitHub login

## ✅ System Status

Your authentication system is now fully functional with:
- ✅ JWT tokenization
- ✅ Password hashing (bcrypt)
- ✅ Role-based access control
- ✅ Admin bypass capabilities
- ✅ Proper guards and decorators
- ✅ Input validation
- ✅ Secure authentication flow

You're ready to use the authentication system! 🎉

