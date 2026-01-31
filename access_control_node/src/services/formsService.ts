/**
 * Service for fetching and caching user forms
 */
import { logger } from '../utils/logger.js';
import { getFrappeConfig } from '../config/env.js';
import { FormAssignment } from '../types/index.js';
import { getCache, setCache, CacheKeys } from '../utils/cache.js';
import { recordCacheHit, recordCacheMiss } from '../utils/metrics.js';
import { frappeClient } from '../utils/httpClient.js';

/**
 * Get forms assigned to user (including inherited forms)
 * This is a separate endpoint that can be used independently
 */
export async function getUserForms(frappeUser: string): Promise<FormAssignment[]> {
  try {
    // Check cache first
    const cacheKey = CacheKeys.userForms(frappeUser);
    const cached = await getCache<FormAssignment[]>(cacheKey);
    if (cached) {
      recordCacheHit('user_forms');
      return cached;
    }
    recordCacheMiss('user_forms');

    // Fetch from Frappe
    const config = getFrappeConfig();
    const response = await frappeClient.get(
      `${config.url}/api/method/megatechtrackers.api.permissions.get_user_forms`,
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

    const forms: FormAssignment[] = response.data.message || [];

    // Cache for 15 minutes
    await setCache(cacheKey, forms, 900).catch(err => {
      logger.warn('Failed to cache user forms', {
        error: err instanceof Error ? err.message : String(err),
        frappeUser
      });
    });

    return forms;
  } catch (error) {
    logger.error('Error fetching user forms from Frappe', {
      error: error instanceof Error ? error.message : String(error),
      frappeUser
    });
    // Return empty array on error (fail secure)
    return [];
  }
}

