/**
 * Error Handling Utilities
 */

import { logger } from './logger.js';

// Custom API error class
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ApiError';
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new ApiError(429, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message);
  }
}

// Fastify error handler
export function errorHandler(error, request, reply) {
  const statusCode = error.statusCode || 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    logger.error({ err: error, reqId: request.id }, 'Server error');
  }

  reply.status(statusCode).send({
    error: error.name || 'Error',
    message: isServerError && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message,
    ...(error.details && { details: error.details }),
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
  });
}

// 404 handler
export function notFoundHandler(request, reply) {
  reply.status(404).send({
    error: 'NotFound',
    message: `Route ${request.method} ${request.url} not found`
  });
}
