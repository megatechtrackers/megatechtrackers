import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { captureException } from '../utils/sentry.js';
import { recordError } from '../utils/metrics.js';

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const errorType = err instanceof AppError ? err.constructor.name : 'UnknownError';
  const route = req.path;
  
  // Record error metrics
  recordError(errorType, route);
  
  // Capture in Sentry
  const error = err instanceof Error ? err : new Error(String(err));
  captureException(error, {
    path: req.path,
    method: req.method,
    frappeUser: (req as any).frappeUser,
    requestId: (req as any).requestId
  });

  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    frappeUser: (req as any).frappeUser,
    requestId: (req as any).requestId
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (err instanceof AppError) {
    const apiError = err.toApiError();
    res.status(err.statusCode).json(apiError);
  } else {
    const statusCode = 500;
    const message = err.message || 'Internal server error';

    res.status(statusCode).json({
      error: message,
      ...(isDevelopment && { stack: err.stack })
    });
  }
}
