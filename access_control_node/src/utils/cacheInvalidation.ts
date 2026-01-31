/**
 * Cache invalidation utilities
 * Provides functions to invalidate cached user data when permissions change
 */
import { logger } from './logger.js';
import { deleteCache, deleteCachePattern, CacheKeys } from './cache.js';

/**
 * Invalidate all cache entries for a specific user
 * This should be called when user permissions change (forms, reports, context)
 */
export async function invalidateUserCache(frappeUser: string): Promise<void> {
  try {
    const keysToDelete = [
      CacheKeys.userPermissions(frappeUser),
      CacheKeys.userForms(frappeUser),
      CacheKeys.userReports(frappeUser),
      CacheKeys.userContext(frappeUser),
    ];

    // Delete specific keys
    for (const key of keysToDelete) {
      await deleteCache(key);
    }

    // Delete session validation cache (pattern match)
    await deleteCachePattern(`session:*:${frappeUser}`);

    // Delete report access cache (pattern match)
    await deleteCachePattern(`report_access:${frappeUser}:*`);

    logger.info('User cache invalidated', { frappeUser });
  } catch (error) {
    logger.error('Error invalidating user cache', {
      error: error instanceof Error ? error.message : String(error),
      frappeUser
    });
  }
}

/**
 * Invalidate user permissions cache only
 */
export async function invalidateUserPermissions(frappeUser: string): Promise<void> {
  try {
    await deleteCache(CacheKeys.userPermissions(frappeUser));
    logger.info('User permissions cache invalidated', { frappeUser });
  } catch (error) {
    logger.error('Error invalidating user permissions cache', {
      error: error instanceof Error ? error.message : String(error),
      frappeUser
    });
  }
}

/**
 * Invalidate user forms cache only
 */
export async function invalidateUserForms(frappeUser: string): Promise<void> {
  try {
    await deleteCache(CacheKeys.userForms(frappeUser));
    logger.info('User forms cache invalidated', { frappeUser });
  } catch (error) {
    logger.error('Error invalidating user forms cache', {
      error: error instanceof Error ? error.message : String(error),
      frappeUser
    });
  }
}

/**
 * Invalidate user reports cache only
 */
export async function invalidateUserReports(frappeUser: string): Promise<void> {
  try {
    await deleteCache(CacheKeys.userReports(frappeUser));
    // Also invalidate report access cache for this user
    await deleteCachePattern(`report_access:${frappeUser}:*`);
    logger.info('User reports cache invalidated', { frappeUser });
  } catch (error) {
    logger.error('Error invalidating user reports cache', {
      error: error instanceof Error ? error.message : String(error),
      frappeUser
    });
  }
}

/**
 * Invalidate user context cache only
 */
export async function invalidateUserContext(frappeUser: string): Promise<void> {
  try {
    await deleteCache(CacheKeys.userContext(frappeUser));
    logger.info('User context cache invalidated', { frappeUser });
  } catch (error) {
    logger.error('Error invalidating user context cache', {
      error: error instanceof Error ? error.message : String(error),
      frappeUser
    });
  }
}

/**
 * Invalidate session validation cache for a user
 */
export async function invalidateUserSession(frappeUser: string, sessionId?: string): Promise<void> {
  try {
    if (sessionId) {
      // Invalidate specific session
      const cacheKey = CacheKeys.sessionValidation(frappeUser, sessionId);
      await deleteCache(cacheKey);
    } else {
      // Invalidate all sessions for user
      await deleteCachePattern(`session:*:${frappeUser}`);
    }
    logger.info('User session cache invalidated', { frappeUser, hasSessionId: !!sessionId });
  } catch (error) {
    logger.error('Error invalidating user session cache', {
      error: error instanceof Error ? error.message : String(error),
      frappeUser
    });
  }
}

