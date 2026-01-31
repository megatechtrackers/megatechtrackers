/**
 * Service for fetching and caching user permissions (forms, reports, context)
 */
import { logger } from '../utils/logger.js';
import { getFrappeConfig } from '../config/env.js';
import { UserPermissions, FormAssignment, ReportAssignment, UserContext } from '../types/index.js';
import { getCache, setCache, CacheKeys } from '../utils/cache.js';
import { recordCacheHit, recordCacheMiss } from '../utils/metrics.js';
import { frappeClient } from '../utils/httpClient.js';

/**
 * Get all user permissions (forms, reports, context) - unified cache
 */
export async function getUserPermissions(frappeUser: string): Promise<UserPermissions> {
  try {
    // Check cache first
    const cacheKey = CacheKeys.userPermissions(frappeUser);
    const cached = await getCache<UserPermissions>(cacheKey);
    if (cached) {
      recordCacheHit('user_permissions');
      return cached;
    }
    recordCacheMiss('user_permissions');

    // Fetch from Frappe
    const config = getFrappeConfig();
    const response = await frappeClient.get(
      `${config.url}/api/method/megatechtrackers.api.permissions.get_user_permissions`,
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

    const permissions: UserPermissions = response.data.message || {
      forms: [],
      reports: [],
      context: { vehicles: [], companies: [], departments: [] }
    };

    // Cache for 15 minutes (longer TTL since permissions don't change often)
    await setCache(cacheKey, permissions, 900).catch(err => {
      logger.warn('Failed to cache user permissions', {
        error: err instanceof Error ? err.message : String(err),
        frappeUser
      });
    });

    return permissions;
  } catch (error) {
    logger.error('Error fetching user permissions from Frappe', {
      error: error instanceof Error ? error.message : String(error),
      frappeUser
    });
    // Return empty permissions on error (fail secure)
    return {
      forms: [],
      reports: [],
      context: { vehicles: [], companies: [], departments: [] }
    };
  }
}

/**
 * Get user forms from permissions (uses unified permissions cache)
 */
export async function getUserFormsFromPermissions(frappeUser: string): Promise<FormAssignment[]> {
  const permissions = await getUserPermissions(frappeUser);
  return permissions.forms;
}

/**
 * Get user reports from permissions (uses unified permissions cache)
 */
export async function getUserReportsFromPermissions(frappeUser: string): Promise<ReportAssignment[]> {
  const permissions = await getUserPermissions(frappeUser);
  return permissions.reports;
}

/**
 * Get user context from permissions (uses unified permissions cache)
 */
export async function getUserContextFromPermissions(frappeUser: string): Promise<UserContext> {
  const permissions = await getUserPermissions(frappeUser);
  return permissions.context;
}

