"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidEmail = isValidEmail;
exports.isValidPhone = isValidPhone;
exports.sanitizeString = sanitizeString;
exports.isFutureDate = isFutureDate;
exports.isValidDateRange = isValidDateRange;
exports.generateRandomString = generateRandomString;
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
function isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
}
function sanitizeString(input) {
    return input
        .trim()
        .replace(/[<>]/g, '')
        .replace(/[&]/g, '&amp;')
        .replace(/["]/g, '&quot;')
        .replace(/[']/g, '&#x27;');
}
function isFutureDate(date) {
    return date > new Date();
}
function isValidDateRange(startDate, endDate) {
    return startDate < endDate;
}
function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
//# sourceMappingURL=validation.util.js.map