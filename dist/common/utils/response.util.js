"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.successResponse = successResponse;
exports.errorResponse = errorResponse;
exports.paginatedResponse = paginatedResponse;
function successResponse(data, message = 'Success') {
    return {
        success: true,
        message,
        data,
        timestamp: new Date().toISOString(),
    };
}
function errorResponse(error, message = 'Error') {
    return {
        success: false,
        message,
        error,
        timestamp: new Date().toISOString(),
    };
}
function paginatedResponse(data, page, limit, total, message = 'Success') {
    const totalPages = Math.ceil(total / limit);
    return {
        success: true,
        message,
        data: {
            items: data,
            pagination: {
                page,
                limit,
                total,
                totalPages,
            },
        },
        timestamp: new Date().toISOString(),
    };
}
//# sourceMappingURL=response.util.js.map