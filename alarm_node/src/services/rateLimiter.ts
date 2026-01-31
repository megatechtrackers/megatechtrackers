import Redis from 'ioredis';
import logger from '../utils/logger';

/**
 * Redis-based Rate Limiter
 * 
 * Implements Token Bucket and Sliding Window algorithms
 * for rate limiting per channel, domain, and recipient
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  burstAllowance?: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

class RateLimiter {
  private redis!: Redis;
  private enabled: boolean;

  constructor() {
    this.enabled = !!process.env.REDIS_URL;
    
    if (this.enabled) {
      this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        retryStrategy: (times) => {
          if (times > 3) {
            logger.error('Redis connection failed, disabling rate limiter');
            this.enabled = false;
            return null;
          }
          return Math.min(times * 100, 3000);
        }
      });

      this.redis.on('error', (error) => {
        logger.error('Redis error:', error);
      });

      this.redis.on('connect', () => {
        logger.info('Redis connected for rate limiting');
      });
    } else {
      logger.warn('Rate limiter disabled - REDIS_URL not configured');
    }
  }

  /**
   * Check rate limit using sliding window algorithm
   */
  async checkLimit(key: string, rateConfig: RateLimitConfig): Promise<RateLimitResult> {
    if (!this.enabled) {
      return { allowed: true, remaining: rateConfig.maxRequests, resetAt: new Date() };
    }

    const now = Date.now();
    const windowStart = now - rateConfig.windowMs;
    const redisKey = `ratelimit:${key}`;

    try {
      // Use Redis sorted set with timestamps as scores
      const pipeline = this.redis.pipeline();
      
      // Remove old entries outside the window
      pipeline.zremrangebyscore(redisKey, 0, windowStart);
      
      // Count current entries
      pipeline.zcard(redisKey);
      
      // Add current request
      pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);
      
      // Set expiry
      pipeline.expire(redisKey, Math.ceil(rateConfig.windowMs / 1000));
      
      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Pipeline execution failed');
      }

      const currentCount = (results[1][1] as number) || 0;
      const allowed = currentCount < rateConfig.maxRequests;
      const remaining = Math.max(0, rateConfig.maxRequests - currentCount - 1);

      // Calculate reset time
      const oldestEntry = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
      const resetAt = oldestEntry.length > 0 
        ? new Date(parseInt(oldestEntry[1]) + rateConfig.windowMs)
        : new Date(now + rateConfig.windowMs);

      if (!allowed) {
        const retryAfter = Math.ceil((resetAt.getTime() - now) / 1000);
        
        logger.warn('Rate limit exceeded', {
          key,
          currentCount,
          maxRequests: rateConfig.maxRequests,
          retryAfter
        });

        return { allowed: false, remaining: 0, resetAt, retryAfter };
      }

      return { allowed: true, remaining, resetAt };
    } catch (error: any) {
      logger.error('Rate limit check failed:', error);
      // Fail open - allow request if rate limiter errors
      return { allowed: true, remaining: rateConfig.maxRequests, resetAt: new Date() };
    }
  }

  /**
   * Check email rate limit
   */
  async checkEmailLimit(recipient: string): Promise<RateLimitResult> {
    const domain = recipient.split('@')[1] || 'unknown';
    
    // Check per-domain limit (e.g., Gmail: 10/minute)
    const domainLimit = await this.checkLimit(`email:domain:${domain}`, {
      maxRequests: this.getDomainLimit(domain),
      windowMs: 60000 // 1 minute
    });

    if (!domainLimit.allowed) {
      return domainLimit;
    }

    // Check per-recipient limit (e.g., 1 email/hour per recipient)
    return this.checkLimit(`email:recipient:${recipient}`, {
      maxRequests: 1,
      windowMs: 3600000 // 1 hour
    });
  }

  /**
   * Check SMS rate limit
   */
  async checkSmsLimit(phoneNumber: string): Promise<RateLimitResult> {
    // Check per-number limit (e.g., 3 SMS/hour per number)
    return this.checkLimit(`sms:recipient:${phoneNumber}`, {
      maxRequests: 3,
      windowMs: 3600000 // 1 hour
    });
  }

  /**
   * Check voice call rate limit
   */
  async checkVoiceLimit(phoneNumber: string): Promise<RateLimitResult> {
    // Check per-number limit (e.g., 2 calls/hour per number - more restrictive than SMS)
    return this.checkLimit(`voice:recipient:${phoneNumber}`, {
      maxRequests: 2,
      windowMs: 3600000 // 1 hour
    });
  }

  /**
   * Get domain-specific rate limits
   */
  private getDomainLimit(domain: string): number {
    const limits: { [key: string]: number } = {
      'gmail.com': 10,
      'yahoo.com': 5,
      'outlook.com': 10,
      'hotmail.com': 10,
      'default': 20
    };

    return limits[domain] || limits['default'];
  }

  /**
   * Reset rate limit for a key (useful for testing or manual resets)
   */
  async resetLimit(key: string): Promise<void> {
    if (this.enabled) {
      await this.redis.del(`ratelimit:${key}`);
      logger.info(`Rate limit reset for key: ${key}`);
    }
  }

  /**
   * Get current rate limit status
   */
  async getStatus(key: string): Promise<{ count: number; ttl: number }> {
    if (!this.enabled) {
      return { count: 0, ttl: 0 };
    }

    const redisKey = `ratelimit:${key}`;
    const count = await this.redis.zcard(redisKey);
    const ttl = await this.redis.ttl(redisKey);

    return { count, ttl };
  }

  async close(): Promise<void> {
    if (this.enabled) {
      await this.redis.quit();
      logger.info('Redis connection closed');
    }
  }
}

export default new RateLimiter();
