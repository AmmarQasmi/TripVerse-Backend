/**
 * Response Utility Functions
 * 
 * Common response formatting utilities for consistent API responses.
 * These functions help maintain a uniform response structure across all endpoints.
 */

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Creates a successful API response
 * 
 * @param data - The data to return
 * @param message - Success message
 * @returns Formatted success response
 */
export function successResponse<T>(data: T, message: string = 'Success'): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates an error API response
 * 
 * @param error - Error message
 * @param message - Custom message
 * @returns Formatted error response
 */
export function errorResponse(error: string, message: string = 'Error'): ApiResponse {
  return {
    success: false,
    message,
    error,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates a paginated response
 * 
 * @param data - Array of data
 * @param page - Current page number
 * @param limit - Items per page
 * @param total - Total number of items
 * @param message - Success message
 * @returns Formatted paginated response
 */
export function paginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
  message: string = 'Success'
): ApiResponse<{
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
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
