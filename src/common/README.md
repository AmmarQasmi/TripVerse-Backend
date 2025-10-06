# Common Module

This module contains shared utilities, guards, decorators, and constants used across the TripVerse backend application.

## Structure

```
common/
├── guards/           # Authentication and authorization guards
├── decorators/       # Custom parameter and method decorators
├── utils/           # Utility functions and helpers
└── README.md        # This file
```

## Guards

### AuthGuard
- **Purpose**: Protects routes that require authentication
- **Usage**: `@UseGuards(AuthGuard)`
- **Status**: TODO - JWT validation implementation needed

### RolesGuard
- **Purpose**: Implements role-based access control
- **Usage**: `@UseGuards(AuthGuard, RolesGuard)` with `@Roles('admin')`
- **Status**: TODO - Role checking logic needed

## Decorators

### @Roles()
- **Purpose**: Specifies required roles for route access
- **Usage**: `@Roles('admin', 'driver')`
- **Works with**: RolesGuard

### @CurrentUser()
- **Purpose**: Extracts current user from request
- **Usage**: `@CurrentUser() user: User`
- **Requires**: Authentication middleware

## Utils

### Response Utilities
- `successResponse()` - Format successful API responses
- `errorResponse()` - Format error API responses
- `paginatedResponse()` - Format paginated data responses

### Validation Utilities
- `isValidEmail()` - Email format validation
- `isValidPhone()` - Phone number validation
- `sanitizeString()` - String sanitization
- `isFutureDate()` - Future date validation
- `isValidDateRange()` - Date range validation
- `generateRandomString()` - Random string generation

### Constants
- User roles, booking statuses, payment statuses
- Room types, currency codes, commission rates
- Pagination defaults, cache TTL, file limits
- Rate limits, error messages, success messages

## Usage Examples

### Protecting a Route
```typescript
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
export class AdminController {
  @Get('users')
  @Roles('admin')
  getUsers(@CurrentUser() user: User) {
    // Only admins can access this route
  }
}
```

### Formatting API Responses
```typescript
@Get('users')
async getUsers() {
  const users = await this.usersService.findAll();
  return successResponse(users, 'Users retrieved successfully');
}
```

### Validation
```typescript
@Post('users')
async createUser(@Body() createUserDto: CreateUserDto) {
  if (!isValidEmail(createUserDto.email)) {
    throw new BadRequestException('Invalid email format');
  }
  // ... rest of the logic
}
```

## TODO

- [ ] Implement JWT validation in AuthGuard
- [ ] Implement role checking logic in RolesGuard
- [ ] Add more validation utilities as needed
- [ ] Add logging utilities
- [ ] Add error handling utilities
