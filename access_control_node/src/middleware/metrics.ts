/**
 * Metrics collection middleware
 */
import { Request, Response, NextFunction } from 'express';
import { recordHttpRequest } from '../utils/metrics.js';

/**
 * Middleware to record HTTP request metrics
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  const route = req.route?.path || req.path;

  // Override res.end to capture response status and duration
  const originalEnd = res.end.bind(res);
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    const duration = (Date.now() - startTime) / 1000;
    recordHttpRequest(
      req.method,
      route,
      res.statusCode,
      duration
    );
    if (typeof chunk === 'function') {
      return originalEnd(chunk);
    } else if (typeof encoding === 'function') {
      return originalEnd(chunk, encoding);
    } else {
      return originalEnd(chunk, encoding, cb);
    }
  } as typeof res.end;

  next();
}

