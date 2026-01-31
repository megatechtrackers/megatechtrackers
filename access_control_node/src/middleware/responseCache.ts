/**
 * Response caching middleware
 */
import { Request, Response, NextFunction } from 'express';
import { getCache, setCache } from '../utils/cache.js';
import { recordCacheHit, recordCacheMiss } from '../utils/metrics.js';
import { logger } from '../utils/logger.js';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  keyGenerator?: (req: Request) => string;
  skipCache?: (req: Request) => boolean;
}

const defaultOptions: CacheOptions = {
  ttl: 300, // 5 minutes default
  keyGenerator: (req) => `${req.method}:${req.path}:${JSON.stringify(req.query)}`,
  skipCache: () => false,
};

/**
 * Response caching middleware
 */
export function responseCache(options: CacheOptions = {}) {
  const opts = { ...defaultOptions, ...options };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip if skipCache returns true
    if (opts.skipCache && opts.skipCache(req)) {
      return next();
    }

    const cacheKey = opts.keyGenerator ? opts.keyGenerator(req) : defaultOptions.keyGenerator!(req);

    try {
      // Try to get from cache
      const cached = await getCache<{ data: unknown; headers: Record<string, string> }>(cacheKey);
      
      if (cached) {
        recordCacheHit('http_response');
        // Set cached headers
        Object.entries(cached.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
        res.setHeader('X-Cache', 'HIT');
        res.json(cached.data);
        return;
      }

      recordCacheMiss('http_response');

      // Override res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = function(body: unknown) {
        // Cache the response
        setCache(
          cacheKey,
          {
            data: body,
            headers: {
              'Content-Type': 'application/json',
            }
          },
          opts.ttl
        ).catch((err: unknown) => {
          // Log but don't fail the request
          logger.error('Cache set error', { error: err });
        });

        res.setHeader('X-Cache', 'MISS');
        return originalJson(body);
      };

      next();
    } catch (error) {
      // If cache fails, continue without caching
      logger.error('Cache middleware error', { error });
      next();
    }
  };
}

