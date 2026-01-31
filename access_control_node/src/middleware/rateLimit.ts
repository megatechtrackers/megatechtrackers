/**
 * Rate limiting middleware
 * Implements per-IP and per-user rate limiting
 */
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../utils/errors.js';

/**
 * General rate limiter (per IP)
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, _res: Response, next: NextFunction) => {
    const error = new RateLimitError('Too many requests from this IP, please try again later.');
    next(error);
  },
});

/**
 * Strict rate limiter for embed URL generation (per user)
 */
export const embedUrlRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each user to 50 embed URL generations per windowMs
  keyGenerator: (req: Request) => {
    // Use user identifier for per-user rate limiting
    const frappeUser = (req as any).frappeUser || req.ip || 'unknown';
    return `embed_url:${frappeUser}`;
  },
  message: 'Too many embed URL requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, _res: Response, next: NextFunction) => {
    const error = new RateLimitError('Too many embed URL requests, please try again later.');
    next(error);
  },
});

/**
 * API rate limiter (per IP)
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: 'Too many API requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, _res: Response, next: NextFunction) => {
    const error = new RateLimitError('Too many API requests, please try again later.');
    next(error);
  },
});
