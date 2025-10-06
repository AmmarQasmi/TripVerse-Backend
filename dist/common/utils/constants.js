"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUCCESS_MESSAGES = exports.ERROR_MESSAGES = exports.RATE_LIMITS = exports.FILE_LIMITS = exports.CACHE_TTL = exports.PAGINATION_DEFAULTS = exports.COMMISSION_RATE = exports.CURRENCY_CODES = exports.ROOM_TYPES = exports.PAYMENT_STATUS = exports.BOOKING_STATUS = exports.USER_ROLES = void 0;
exports.USER_ROLES = {
    CLIENT: 'client',
    DRIVER: 'driver',
    ADMIN: 'admin',
};
exports.BOOKING_STATUS = {
    PENDING_PAYMENT: 'PENDING_PAYMENT',
    CONFIRMED: 'CONFIRMED',
    CANCELLED: 'CANCELLED',
};
exports.PAYMENT_STATUS = {
    REQUIRES_PAYMENT: 'requires_payment',
    COMPLETED: 'completed',
    REFUNDED: 'refunded',
};
exports.ROOM_TYPES = {
    SINGLE: 'SINGLE',
    DOUBLE: 'DOUBLE',
    DELUXE: 'DELUXE',
    SUITE: 'SUITE',
};
exports.CURRENCY_CODES = {
    USD: 'usd',
    PKR: 'pkr',
};
exports.COMMISSION_RATE = 0.05;
exports.PAGINATION_DEFAULTS = {
    PAGE: 1,
    LIMIT: 10,
    MAX_LIMIT: 100,
};
exports.CACHE_TTL = {
    WEATHER: 600,
    HOTELS: 300,
    CARS: 300,
};
exports.FILE_LIMITS = {
    MAX_SIZE: 5 * 1024 * 1024,
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
    ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword'],
};
exports.RATE_LIMITS = {
    SEARCH: 100,
    UPLOAD: 20,
    BOOKING: 10,
};
exports.ERROR_MESSAGES = {
    UNAUTHORIZED: 'Unauthorized access',
    FORBIDDEN: 'Access forbidden',
    NOT_FOUND: 'Resource not found',
    VALIDATION_ERROR: 'Validation failed',
    INTERNAL_ERROR: 'Internal server error',
    INVALID_CREDENTIALS: 'Invalid credentials',
    USER_NOT_FOUND: 'User not found',
    BOOKING_NOT_FOUND: 'Booking not found',
    PAYMENT_FAILED: 'Payment processing failed',
};
exports.SUCCESS_MESSAGES = {
    USER_CREATED: 'User created successfully',
    USER_UPDATED: 'User updated successfully',
    BOOKING_CREATED: 'Booking created successfully',
    BOOKING_CANCELLED: 'Booking cancelled successfully',
    PAYMENT_SUCCESS: 'Payment processed successfully',
    DRIVER_VERIFIED: 'Driver verified successfully',
    MONUMENT_RECOGNIZED: 'Monument recognized successfully',
};
//# sourceMappingURL=constants.js.map