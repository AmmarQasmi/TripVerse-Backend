# 🚀 Quick Start - Authentication System

## 📌 Summary

Your complete authentication system is now ready! Here's what was implemented:

### ✅ What's Done

1. **JWT Token Authentication** - Secure token-based auth
2. **Password Hashing** - All passwords hashed with bcrypt
3. **Role-Based Access Control** - admin, driver, client roles
4. **Admin Bypass** - Admins can access everything
5. **Complete API Endpoints** - signup, login, logout, profile
6. **Guards & Decorators** - Ready-to-use security components

---

## ⚡ Test It Now

### 1. **Add Environment Variables**

Create a `.env` file in your project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/tripverse
JWT_SECRET=my-super-secret-jwt-key-2024
JWT_EXPIRES_IN=7d
PORT=3000
```

### 2. **Start the Server**

```bash
npm run start:dev
```

### 3. **Test the Endpoints**

#### **Signup** (Create Admin)
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"full_name\":\"Admin User\",\"email\":\"admin@test.com\",\"password\":\"admin123\",\"role\":\"admin\",\"region\":\"Global\"}"
```

#### **Signup** (Create Driver)
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"full_name\":\"Driver User\",\"email\":\"driver@test.com\",\"password\":\"driver123\",\"role\":\"driver\",\"region\":\"California\"}"
```

#### **Signup** (Create Client)
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"full_name\":\"Client User\",\"email\":\"client@test.com\",\"password\":\"client123\",\"role\":\"client\",\"region\":\"New York\"}"
```

#### **Login**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"client@test.com\",\"password\":\"client123\"}"
```

**Save the token from the response!** It looks like:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

#### **Get Profile** (Protected)
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## 🎯 API Endpoints Summary

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/auth/signup` | POST | ❌ No | Create new user account |
| `/api/auth/login` | POST | ❌ No | Login and get JWT token |
| `/api/auth/logout` | POST | ❌ No | Logout (client-side token removal) |
| `/api/auth/me` | GET | ✅ Yes | Get current user profile |
| `/api/users/profile` | GET | ✅ Yes | Get detailed user profile |
| `/api/users/client-dashboard` | GET | ✅ Yes (client) | Client-only endpoint |
| `/api/drivers/profile` | GET | ✅ Yes (driver) | Driver-only endpoint |
| `/api/admin/dashboard` | GET | ✅ Yes (admin) | Admin-only endpoint |
| `/api/admin/all-users` | GET | ✅ Yes (admin) | Admin-only endpoint |

---

## 🛡️ How to Protect Your Routes

### Option 1: Authentication Only
Any logged-in user can access:

```typescript
@Get('endpoint')
@UseGuards(JwtAuthGuard)
getData(@CurrentUser() user: any) {
  return { data: 'protected' };
}
```

### Option 2: Role-Based Access
Only specific roles can access:

```typescript
@Get('endpoint')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.driver)
getData(@CurrentUser() user: any) {
  // Only drivers (and admins) can access
  return { data: 'driver data' };
}
```

### Option 3: Multiple Roles
Allow multiple roles:

```typescript
@Get('endpoint')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.driver, Role.client)
getData(@CurrentUser() user: any) {
  // Drivers, clients, and admins can access
  return { data: 'multi-role data' };
}
```

---

## 🔑 Role Permissions

### Admin
- ✅ Can access **ALL** endpoints (bypasses all restrictions)
- ✅ See everything in the system
- ✅ Manage all resources

### Driver
- ✅ Access driver-specific endpoints
- ✅ Manage their cars and bookings
- ❌ Cannot access client-only endpoints (unless admin)

### Client
- ✅ Access client-specific endpoints
- ✅ Book hotels and cars
- ❌ Cannot access driver-only endpoints (unless admin)

---

## 💡 Common Use Cases

### Get Current User in Any Endpoint

```typescript
@Get('my-bookings')
@UseGuards(JwtAuthGuard)
getMyBookings(@CurrentUser() user: any) {
  // user contains: id, email, full_name, role, region
  return this.bookingsService.findByUserId(user.id);
}
```

### Check User Role Programmatically

```typescript
@Get('data')
@UseGuards(JwtAuthGuard)
getData(@CurrentUser() user: any) {
  if (user.role === Role.admin) {
    return { data: 'all data' };
  } else {
    return { data: 'filtered data' };
  }
}
```

---

## 🔒 Security Features

✅ **Password Hashing**: bcrypt with 10 salt rounds  
✅ **JWT Tokens**: Secure, signed tokens  
✅ **Input Validation**: All DTOs validated  
✅ **Role Verification**: Automatic role checking  
✅ **Token Expiration**: Configurable (default 7 days)  
✅ **Admin Bypass**: Admins override all restrictions  

---

## 📚 Documentation

- **Detailed Guide**: See `AUTH_SETUP.md`
- **Auth Module Docs**: See `src/auth/README.md`

---

## 🎉 You're All Set!

Your authentication system is fully functional. Start protecting your routes and implementing role-based access control!

### What to Do Next:

1. ✅ Add `.env` file with your configuration
2. ✅ Start the server: `npm run start:dev`
3. ✅ Test signup and login endpoints
4. ✅ Add guards to your existing controllers
5. ✅ Implement role-specific logic

**Questions or Issues?**  
Check the detailed documentation in `AUTH_SETUP.md` and `src/auth/README.md`

---

**Happy Coding! 🚀**

