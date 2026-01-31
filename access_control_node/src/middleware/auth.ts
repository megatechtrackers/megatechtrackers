import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { AuthenticationError } from '../utils/errors.js';
import { getFrappeConfig } from '../config/env.js';
import { getCache, setCache, CacheKeys } from '../utils/cache.js';
import { recordCacheHit, recordCacheMiss } from '../utils/metrics.js';

declare global {
  namespace Express {
    interface Request {
      frappeUser?: string;
      requestId?: string;
    }
  }
}

/**
 * Validate Frappe session/authentication
 * This middleware extracts and validates the Frappe user from the request
 */
export async function validateFrappeSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get Frappe user from headers or body
    const frappeUser = req.headers['x-frappe-user'] as string || 
                      (req.body as any)?.frappeUser || 
                      (req.query as any)?.frappeUser;
    const frappeSessionId = req.headers['x-frappe-session-id'] as string || 
                            req.headers['cookie'] as string;

    if (!frappeUser) {
      throw new AuthenticationError('Missing Frappe user information');
    }

    // Validate session with Frappe (optional but recommended)
    if (frappeSessionId) {
      const isValid = await validateFrappeSessionWithBackend(frappeUser, frappeSessionId);
      if (!isValid) {
        throw new AuthenticationError('Frappe session validation failed');
      }
    }

    // Attach Frappe user to request
    req.frappeUser = frappeUser;
    next();
  } catch (error) {
    logger.error('Error validating Frappe session', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.requestId
    });
    
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        error: 'Frappe authentication required',
        message: error.message
      });
    } else {
      res.status(500).json({
        error: 'Authentication error',
        message: 'Failed to validate Frappe session'
      });
    }
  }
}

/**
 * Validate Frappe session with backend (with caching)
 */
async function validateFrappeSessionWithBackend(
  frappeUser: string,
  sessionId: string
): Promise<boolean> {
  try {
    // Check cache first
    const cacheKey = CacheKeys.sessionValidation(frappeUser, sessionId);
    const cached = await getCache<boolean>(cacheKey);
    if (cached !== null) {
      recordCacheHit('session_validation');
      return cached;
    }
    recordCacheMiss('session_validation');

    // Validate with Frappe
    const config = getFrappeConfig();
    const response = await fetch(
      `${config.url}/api/method/frappe.auth.get_logged_user`,
      {
        method: 'GET',
        headers: {
          'Cookie': sessionId,
          'Content-Type': 'application/json'
        }
      }
    );

    let isValid = false;
    if (response.ok) {
      const data = await response.json() as { message?: string };
      isValid = data.message === frappeUser;
    }

    // Cache result (shorter TTL for security - 2 minutes)
    await setCache(cacheKey, isValid, 120).catch(err => {
      logger.warn('Failed to cache session validation', {
        error: err instanceof Error ? err.message : String(err)
      });
    });

    return isValid;
  } catch (error) {
    logger.error('Error validating Frappe session with backend', {
      error: error instanceof Error ? error.message : String(error)
    });
    // Fail open in case of network issues (can be made stricter)
    return true;
  }
}
