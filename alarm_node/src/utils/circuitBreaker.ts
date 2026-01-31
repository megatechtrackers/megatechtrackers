import logger from './logger';
import { CircuitBreakerOptions, CircuitBreakerStatus } from '../types';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private name: string;
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private nextAttemptTime: number | null = null;
  
  private failureThreshold: number;
  private timeout: number;
  
  // Mutex to prevent race conditions during HALF_OPEN state
  private halfOpenLock: boolean = false;
  private halfOpenRequestsInFlight: number = 0;
  private halfOpenMaxConcurrent: number = 1; // Only allow 1 request at a time in HALF_OPEN

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.timeout = options.timeout || 60000;
    
    logger.info(`Circuit breaker initialized: ${this.name}`, {
      failureThreshold: this.failureThreshold,
      timeout: this.timeout
    });
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // If OPEN, check if we should try recovery (HALF_OPEN)
    if (this.state === 'OPEN') {
      const now = Date.now();
      const nextAttempt = this.nextAttemptTime || 0;
      
      if (now < nextAttempt) {
        // Still in timeout period, reject immediately but mark as retryable
        const error: any = new Error(`Circuit breaker is OPEN for ${this.name}. Will retry after ${Math.ceil((nextAttempt - now) / 1000)}s`);
        error.code = 'CIRCUIT_BREAKER_OPEN';
        error.retryable = true; // Mark as retryable so it can be retried after timeout
        error.retryAfter = Math.ceil((nextAttempt - now) / 1000); // Seconds until retry
        throw error;
      }
      
      // Timeout expired, try recovery - but only if we're not already in HALF_OPEN
      if (!this.halfOpenLock) {
        this.halfOpenLock = true;
        this.state = 'HALF_OPEN';
        this.successCount = 0; // Reset success count for recovery attempt
        this.halfOpenRequestsInFlight = 0;
        logger.info(`Circuit breaker entering HALF_OPEN state: ${this.name} - Attempting recovery`);
      }
    }
    
    // If HALF_OPEN, only allow limited concurrent requests to prevent race conditions
    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenRequestsInFlight >= this.halfOpenMaxConcurrent) {
        // Too many requests in flight during HALF_OPEN, reject this one
        // This prevents the race condition where multiple requests fail the recovery
        const error: any = new Error(`Circuit breaker is in HALF_OPEN for ${this.name}, recovery in progress, please wait`);
        error.code = 'CIRCUIT_BREAKER_HALF_OPEN_BUSY';
        error.retryable = true;
        error.retryAfter = 2; // Retry in 2 seconds
        throw error;
      }
      this.halfOpenRequestsInFlight++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      if (this.state === 'HALF_OPEN' || this.halfOpenLock) {
        this.halfOpenRequestsInFlight = Math.max(0, this.halfOpenRequestsInFlight - 1);
      }
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      
      // Immediately close on first success to prevent race condition
      // This is more aggressive but prevents the constant OPEN/HALF_OPEN cycling
      if (this.successCount >= 1) { // Changed from successThreshold to 1
        this.state = 'CLOSED';
        this.successCount = 0;
        this.halfOpenLock = false;
        this.halfOpenRequestsInFlight = 0;
        logger.info(`Circuit breaker CLOSED: ${this.name} - Service recovered after ${this.successCount} success(es)`);
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      // In HALF_OPEN, a single failure returns us to OPEN
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.timeout;
      this.successCount = 0;
      this.halfOpenLock = false;
      this.halfOpenRequestsInFlight = 0;
      logger.warn(`Circuit breaker OPEN: ${this.name} - Recovery failed`);
    } else if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.timeout;
      this.successCount = 0;
      logger.error(`Circuit breaker OPEN: ${this.name} - Failure threshold reached`, {
        failureCount: this.failureCount,
        threshold: this.failureThreshold
      });
    }
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.halfOpenLock = false;
    this.halfOpenRequestsInFlight = 0;
    logger.info(`Circuit breaker manually reset: ${this.name}`);
  }

  getStatus(): CircuitBreakerStatus {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  isAvailable(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }
    
    if (this.state === 'HALF_OPEN') {
      // Only available if we have room for more requests
      return this.halfOpenRequestsInFlight < this.halfOpenMaxConcurrent;
    }
    
    if (this.state === 'OPEN' && Date.now() >= (this.nextAttemptTime || 0)) {
      return true;
    }
    
    return false;
  }
}
