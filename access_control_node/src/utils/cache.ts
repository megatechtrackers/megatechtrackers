/**
 * Redis caching layer for permissions and API responses
 */
import { createClient, RedisClientType } from 'redis';
import { logger } from './logger.js';

let redisClient: RedisClientType | null = null;
let isConnected = false;

/**
 * Initialize Redis connection
 */
export async function initRedis(): Promise<void> {
  if (redisClient && isConnected) {
    return;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  try {
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            logger.error('Redis connection failed after 10 retries');
            return new Error('Redis connection failed');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err: Error) => {
      logger.error('Redis client error', { error: err.message });
      isConnected = false;
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connecting');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
      isConnected = true;
    });

    await redisClient.connect();
    logger.info('Redis connection established', { redisUrl });
  } catch (error) {
    logger.error('Redis connection failed, continuing without cache', {
      error: error instanceof Error ? error.message : String(error),
      redisUrl,
      stack: error instanceof Error ? error.stack : undefined
    });
    isConnected = false;
  }
}

/**
 * Get value from cache
 */
export async function getCache<T>(key: string): Promise<T | null> {
  if (!redisClient || !isConnected) {
    // Try to reconnect if not connected
    if (!isConnected) {
      try {
        await initRedis();
      } catch (err) {
        // Silently fail - return null
      }
    }
    if (!redisClient || !isConnected) {
      return null;
    }
  }

  try {
    const value = await redisClient.get(key);
    if (value) {
      return JSON.parse(value) as T;
    }
    return null;
  } catch (error) {
    logger.error('Cache get error', {
      error: error instanceof Error ? error.message : String(error),
      key
    });
    return null;
  }
}

/**
 * Set value in cache with TTL
 */
export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds: number = 300
): Promise<void> {
  if (!redisClient || !isConnected) {
    logger.warn('Redis not connected - attempting reconnect', {
      key,
      hasClient: !!redisClient,
      isConnected
    });
    // Try to reconnect if not connected
    if (!isConnected) {
      try {
        await initRedis();
      } catch (err) {
        logger.error('Failed to reconnect to Redis', {
          error: err instanceof Error ? err.message : String(err)
        });
        throw new Error(`Failed to store cache: Redis not connected and reconnect failed`);
      }
    }
    // If still not connected after reconnect attempt, throw error
    if (!redisClient || !isConnected) {
      throw new Error(`Failed to store cache: Redis not connected`);
    }
  }

  try {
    const result = await redisClient.setEx(
      key,
      ttlSeconds,
      JSON.stringify(value)
    );
    logger.info('Cache set successful', { key, ttlSeconds, result });
    
    // Verify the value was actually stored
    const verify = await redisClient.get(key);
    if (!verify) {
      logger.error('Cache set verification failed - value not found after set', { key });
      throw new Error('Cache set failed - value not persisted');
    }
    logger.debug('Cache set verified', { key });
  } catch (error) {
    logger.error('Cache set error', {
      error: error instanceof Error ? error.message : String(error),
      key,
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error; // Re-throw so caller knows it failed
  }
}

/**
 * Delete value from cache
 */
export async function deleteCache(key: string): Promise<void> {
  if (!redisClient || !isConnected) {
    return;
  }

  try {
    await redisClient.del(key);
  } catch (error) {
    logger.error('Cache delete error', {
      error: error instanceof Error ? error.message : String(error),
      key
    });
  }
}

/**
 * Delete cache by pattern
 */
export async function deleteCachePattern(pattern: string): Promise<void> {
  if (!redisClient || !isConnected) {
    return;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    logger.error('Cache delete pattern error', {
      error: error instanceof Error ? error.message : String(error),
      pattern
    });
  }
}

/**
 * Hash session ID for security (don't store raw session IDs in cache keys)
 */
function hashSessionId(sessionId: string): string {
  // Simple hash function - in production, consider using crypto.createHash
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    const char = sessionId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Cache key generators
 */
export const CacheKeys = {
  userPermissions: (user: string) => `permissions:${user}`,
  userReports: (user: string) => `reports:${user}`,
  userForms: (user: string) => `forms:${user}`,
  userContext: (user: string) => `context:${user}`,
  sessionValidation: (user: string, sessionId: string) => 
    `session:${hashSessionId(sessionId)}:${user}`,
  reportAccess: (user: string, reportId: string) => 
    `report_access:${user}:${reportId}`,
  grafanaReports: () => 'grafana:reports:all',
  embedUrl: (user: string, reportId: number) => `embed:${user}:${reportId}`,
};

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient && isConnected) {
    try {
      await redisClient.quit();
      isConnected = false;
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

