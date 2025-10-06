/**
 * Application Constants
 * 
 * Centralized constants used throughout the application.
 * This helps maintain consistency and makes configuration changes easier.
 */

// User Roles
export const USER_ROLES = {
  CLIENT: 'client',
  DRIVER: 'driver',
  ADMIN: 'admin',
} as const;

// Booking Status
export const BOOKING_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;

// Payment Status
export const PAYMENT_STATUS = {
  REQUIRES_PAYMENT: 'requires_payment',
  COMPLETED: 'completed',
  REFUNDED: 'refunded',
} as const;

// Room Types
export const ROOM_TYPES = {
  SINGLE: 'SINGLE',
  DOUBLE: 'DOUBLE',
  DELUXE: 'DELUXE',
  SUITE: 'SUITE',
} as const;

// Currency Codes
export const CURRENCY_CODES = {
  USD: 'usd',
  PKR: 'pkr',
} as const;

// Commission Rate (5% platform, 95% driver)
export const COMMISSION_RATE = 0.05;

// Pagination Defaults
export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 10,
  MAX_LIMIT: 100,
} as const;

// Cache TTL (Time To Live) in seconds
export const CACHE_TTL = {
  WEATHER: 600, // 10 minutes
  HOTELS: 300,  // 5 minutes
  CARS: 300,    // 5 minutes
} as const;

// File Upload Limits
export const FILE_LIMITS = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword'],
} as const;

// API Rate Limits
export const RATE_LIMITS = {
  SEARCH: 100, // requests per hour
  UPLOAD: 20,  // requests per hour
  BOOKING: 10, // requests per hour
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Access forbidden',
  NOT_FOUND: 'Resource not found',
  VALIDATION_ERROR: 'Validation failed',
  INTERNAL_ERROR: 'Internal server error',
  INVALID_CREDENTIALS: 'Invalid credentials',
  USER_NOT_FOUND: 'User not found',
  BOOKING_NOT_FOUND: 'Booking not found',
  PAYMENT_FAILED: 'Payment processing failed',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  USER_CREATED: 'User created successfully',
  USER_UPDATED: 'User updated successfully',
  BOOKING_CREATED: 'Booking created successfully',
  BOOKING_CANCELLED: 'Booking cancelled successfully',
  PAYMENT_SUCCESS: 'Payment processed successfully',
  DRIVER_VERIFIED: 'Driver verified successfully',
  MONUMENT_RECOGNIZED: 'Monument recognized successfully',
} as const;
