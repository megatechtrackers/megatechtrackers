import { logger } from './logger.js';
import { getFrappeConfig } from '../config/env.js';
import { UserContext } from '../types/index.js';
import { frappeClient } from './httpClient.js';
import { getCache, setCache, CacheKeys } from './cache.js';
import { recordCacheHit, recordCacheMiss } from './metrics.js';

/**
 * Get user context from Frappe (with caching)
 */
export async function getUserContext(frappeUser: string): Promise<UserContext> {
  try {
    // Check cache first
    const cacheKey = CacheKeys.userContext(frappeUser);
    const cached = await getCache<UserContext>(cacheKey);
    if (cached) {
      recordCacheHit('user_context');
      return cached;
    }
    recordCacheMiss('user_context');

    // Fetch from Frappe
    const config = getFrappeConfig();
    const response = await frappeClient.get(
      `${config.url}/api/method/megatechtrackers.api.permissions.get_user_context`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${config.apiKey}:${config.apiSecret}`
        },
        params: {
          user: frappeUser
        }
      }
    );

    const context: UserContext = response.data.message || { vehicles: [], companies: [], departments: [] };

    // Cache for 15 minutes
    await setCache(cacheKey, context, 900).catch(err => {
      logger.warn('Failed to cache user context', {
        error: err instanceof Error ? err.message : String(err),
        frappeUser
      });
    });

    return context;
  } catch (error) {
    logger.error('Error fetching user context from Frappe', {
      error: error instanceof Error ? error.message : String(error),
      frappeUser
    });
    // Return empty context on error (fail secure)
    return { vehicles: [], companies: [], departments: [] };
  }
}
