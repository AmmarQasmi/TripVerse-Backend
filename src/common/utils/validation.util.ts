/**
 * Validation Utility Functions
 * 
 * Common validation helpers for data validation and sanitization.
 * These functions help ensure data integrity across the application.
 */

/**
 * Validates if a string is a valid email format
 * 
 * @param email - Email string to validate
 * @returns True if email is valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates if a string is a valid phone number
 * 
 * @param phone - Phone string to validate
 * @returns True if phone is valid, false otherwise
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

/**
 * Sanitizes a string by removing potentially harmful characters
 * 
 * @param input - String to sanitize
 * @returns Sanitized string
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/[&]/g, '&amp;') // Escape ampersands
    .replace(/["]/g, '&quot;') // Escape quotes
    .replace(/[']/g, '&#x27;'); // Escape apostrophes
}

/**
 * Validates if a date is in the future
 * 
 * @param date - Date to validate
 * @returns True if date is in the future, false otherwise
 */
export function isFutureDate(date: Date): boolean {
  return date > new Date();
}

/**
 * Validates if a date range is valid (start < end)
 * 
 * @param startDate - Start date
 * @param endDate - End date
 * @returns True if range is valid, false otherwise
 */
export function isValidDateRange(startDate: Date, endDate: Date): boolean {
  return startDate < endDate;
}

/**
 * Generates a random string of specified length
 * 
 * @param length - Length of the string to generate
 * @returns Random string
 */
export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
