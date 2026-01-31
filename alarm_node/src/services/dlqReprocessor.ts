import db from '../db';
import alarmProcessor from './alarmProcessor';
import logger from '../utils/logger';
import metrics from '../utils/metrics';
import config from '../config';
import { Alarm } from '../types';
import { sleep } from '../utils/retry';

/**
 * Dead Letter Queue Reprocessing Service
 * 
 * Handles reprocessing of failed alarms from the DLQ
 * Supports filtering, exponential backoff, and batch processing
 */
class DLQReprocessor {
  private readonly DLQ_ALERT_THRESHOLD: number;
  private readonly MAX_BACKOFF_MS: number;
  private readonly BASE_BACKOFF_MS: number;
  private readonly AUTO_REPROCESS_INTERVAL_MS: number;
  private readonly AUTO_REPROCESS_BATCH_SIZE: number;
  private alertSent: boolean = false;
  private autoReprocessTimer: NodeJS.Timeout | null = null;
  private isAutoReprocessing: boolean = false;
  
  constructor() {
    this.DLQ_ALERT_THRESHOLD = config.dlq.alertThreshold;
    this.MAX_BACKOFF_MS = config.dlq.maxBackoffMs;
    this.BASE_BACKOFF_MS = config.dlq.baseBackoffMs;
    this.AUTO_REPROCESS_INTERVAL_MS = config.dlq.autoReprocessInterval;
    this.AUTO_REPROCESS_BATCH_SIZE = config.dlq.autoReprocessBatchSize;
  }

  /**
   * Calculate exponential backoff delay based on attempts and item age
   */
  private calculateBackoff(attempts: number, itemAgeMs: number): number {
    // Exponential backoff: base * 2^attempts, capped at MAX_BACKOFF_MS
    const exponentialDelay = Math.min(
      this.BASE_BACKOFF_MS * Math.pow(2, attempts),
      this.MAX_BACKOFF_MS
    );
    
    // Add jitter to prevent thundering herd (random 0-20% of delay)
    const jitter = Math.random() * 0.2 * exponentialDelay;
    
    // If item is very old, reduce backoff to process it sooner
    const ageFactor = itemAgeMs > 3600000 ? 0.5 : 1;  // 1 hour threshold
    
    return Math.floor(exponentialDelay * ageFactor + jitter);
  }

  /**
   * Check DLQ size and alert if threshold exceeded
   */
  private async checkAndAlertDLQSize(): Promise<void> {
    try {
      const stats = await this.getStats();
      if (stats.total >= this.DLQ_ALERT_THRESHOLD && !this.alertSent) {
        logger.error(`DLQ size ${stats.total} exceeds threshold ${this.DLQ_ALERT_THRESHOLD}`, {
          total: stats.total,
          byChannel: stats.byChannel,
          byErrorType: stats.byErrorType,
          oldestItem: stats.oldestItem
        });
        metrics.incrementCounter('dlq_alert_triggered');
        this.alertSent = true;
      } else if (stats.total < this.DLQ_ALERT_THRESHOLD) {
        this.alertSent = false;  // Reset alert when below threshold
      }
    } catch (error) {
      logger.error('Error checking DLQ size for alerting:', error);
    }
  }

  /**
   * Reprocess a single DLQ item with exponential backoff
   */
  async reprocessItem(dlqId: number, force: boolean = false): Promise<{ success: boolean; error?: string }> {
    try {
      const dlqItems = await db.getDLQItems(null, 1000);
      const item = dlqItems.find(i => i.id === dlqId);
      
      if (!item) {
        return { success: false, error: 'DLQ item not found' };
      }
      
      if (item.reprocessed && !force) {
        return { success: false, error: 'Item already reprocessed' };
      }
      
      // Calculate backoff based on attempts and item age
      const itemAgeMs = Date.now() - new Date(item.created_at).getTime();
      const backoffMs = this.calculateBackoff(item.attempts || 0, itemAgeMs);
      
      // Apply backoff if not forcing immediate reprocess
      if (!force && backoffMs > 0) {
        logger.debug(`Applying ${backoffMs}ms backoff for DLQ item ${dlqId}`, {
          attempts: item.attempts,
          itemAgeMs,
          backoffMs
        });
        await sleep(backoffMs);
      }
      
      // Validate payload
      if (!item.payload || typeof item.payload !== 'object') {
        throw new Error(`Invalid payload in DLQ item ${dlqId}: payload is not an object`);
      }
      
      // Validate required Alarm fields
      const payload = item.payload as any;
      if (!payload.id && payload.id !== 0) {
        throw new Error(`Invalid payload in DLQ item ${dlqId}: missing alarm id`);
      }
      if (!payload.imei && payload.imei !== 0) {
        throw new Error(`Invalid payload in DLQ item ${dlqId}: missing imei`);
      }
      if (!payload.status || typeof payload.status !== 'string') {
        throw new Error(`Invalid payload in DLQ item ${dlqId}: missing or invalid status`);
      }
      
      const alarm: Alarm = payload as Alarm;
      
      // Reprocess the alarm
      await alarmProcessor['processAlarm'](alarm);
      
      // Mark as reprocessed
      await db.markDLQReprocessed(dlqId);
      
      metrics.incrementCounter('dlq_reprocessed_total');
      logger.info(`Reprocessed DLQ item ${dlqId} for alarm ${alarm.id}`, {
        attempts: item.attempts,
        itemAgeMs,
        backoffMs: force ? 0 : backoffMs
      });
      
      return { success: true };
    } catch (error: any) {
      logger.error(`Error reprocessing DLQ item ${dlqId}:`, error);
      metrics.incrementCounter('dlq_reprocess_error');
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Reprocess multiple DLQ items with filtering and exponential backoff
   */
  async reprocessBatch(
    filters: {
      channel?: string;
      errorType?: string;
      limit?: number;
      force?: boolean;  // Skip backoff if true
    } = {}
  ): Promise<{ processed: number; failed: number; errors: string[] }> {
    const limit = filters.limit || 100;
    const force = filters.force || false;
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];
    
    try {
      // Check and alert on DLQ size
      await this.checkAndAlertDLQSize();
      
      const items = await db.getDLQItems(filters.channel || null, limit);
      
      // Filter by error type if specified
      const filteredItems = filters.errorType
        ? items.filter(item => item.error_type === filters.errorType)
        : items;
      
      // Sort by age (oldest first) and attempts (fewer attempts first)
      filteredItems.sort((a, b) => {
        const ageA = new Date(a.created_at).getTime();
        const ageB = new Date(b.created_at).getTime();
        const attemptsA = a.attempts || 0;
        const attemptsB = b.attempts || 0;
        
        // Prioritize older items with fewer attempts
        if (attemptsA !== attemptsB) {
          return attemptsA - attemptsB;
        }
        return ageA - ageB;
      });
      
      logger.info(`Reprocessing ${filteredItems.length} DLQ items`, {
        ...filters,
        force
      });
      
      for (const item of filteredItems) {
        try {
          const result = await this.reprocessItem(item.id, force);
          if (result.success) {
            processed++;
          } else {
            failed++;
            errors.push(`Item ${item.id}: ${result.error}`);
          }
        } catch (error: any) {
          failed++;
          errors.push(`Item ${item.id}: ${error.message}`);
        }
      }
      
      metrics.incrementCounter('dlq_batch_reprocessed', processed);
      metrics.incrementCounter('dlq_batch_failed', failed);
      metrics.setGauge('dlq_size', filteredItems.length - processed);
      
      logger.info(`DLQ batch reprocessing completed`, {
        processed,
        failed,
        total: filteredItems.length
      });
      
      return { processed, failed, errors };
    } catch (error: any) {
      logger.error('Error in batch reprocessing:', error);
      metrics.incrementCounter('alarm_batch_error');
      throw error;
    }
  }
  
  /**
   * Get DLQ statistics with enhanced metrics
   */
  async getStats(): Promise<{
    total: number;
    byChannel: Record<string, number>;
    byErrorType: Record<string, number>;
    oldestItem: Date | null;
    averageAge: number;  // Average age in milliseconds
    maxAttempts: number;
    averageAttempts: number;
  }> {
    try {
      const items = await db.getDLQItems(null, 10000);
      const notReprocessed = items.filter(i => !i.reprocessed);
      
      const byChannel: Record<string, number> = {};
      const byErrorType: Record<string, number> = {};
      let oldestItem: Date | null = null;
      let totalAge = 0;
      let maxAttempts = 0;
      let totalAttempts = 0;
      
      for (const item of notReprocessed) {
        // Count by channel
        byChannel[item.channel] = (byChannel[item.channel] || 0) + 1;
        
        // Count by error type
        const errorType = item.error_type || 'UNKNOWN';
        byErrorType[errorType] = (byErrorType[errorType] || 0) + 1;
        
        // Find oldest item and calculate ages
        const itemDate = new Date(item.created_at);
        const itemAge = Date.now() - itemDate.getTime();
        totalAge += itemAge;
        
        if (!oldestItem || itemDate < oldestItem) {
          oldestItem = itemDate;
        }
        
        // Track attempts
        const attempts = item.attempts || 0;
        totalAttempts += attempts;
        if (attempts > maxAttempts) {
          maxAttempts = attempts;
        }
      }
      
      const averageAge = notReprocessed.length > 0 ? totalAge / notReprocessed.length : 0;
      const averageAttempts = notReprocessed.length > 0 ? totalAttempts / notReprocessed.length : 0;
      
      // Update metrics
      metrics.setGauge('dlq_total_items', notReprocessed.length);
      metrics.setGauge('dlq_average_age_ms', averageAge);
      metrics.setGauge('dlq_max_attempts', maxAttempts);
      
      return {
        total: notReprocessed.length,
        byChannel,
        byErrorType,
        oldestItem,
        averageAge,
        maxAttempts,
        averageAttempts
      };
    } catch (error) {
      logger.error('Error getting DLQ stats:', error);
      return {
        total: 0,
        byChannel: {},
        byErrorType: {},
        oldestItem: null,
        averageAge: 0,
        maxAttempts: 0,
        averageAttempts: 0
      };
    }
  }

  /**
   * Start automatic DLQ reprocessing
   * Runs periodically to process failed items automatically
   */
  startAutoReprocessing(): void {
    if (this.autoReprocessTimer) {
      logger.warn('Auto DLQ reprocessing already running');
      return;
    }

    logger.info(`Starting automatic DLQ reprocessing (every ${this.AUTO_REPROCESS_INTERVAL_MS / 1000}s, batch size: ${this.AUTO_REPROCESS_BATCH_SIZE})`);

    // Run immediately on startup
    this.runAutoReprocessCycle();

    // Then run periodically
    this.autoReprocessTimer = setInterval(() => {
      this.runAutoReprocessCycle();
    }, config.dlq.autoReprocessInterval);
  }

  /**
   * Run a single auto-reprocess cycle
   */
  private async runAutoReprocessCycle(): Promise<void> {
    if (this.isAutoReprocessing) {
      logger.debug('Auto-reprocess cycle already in progress, skipping');
      return;
    }

    this.isAutoReprocessing = true;
    
    try {
      const stats = await this.getStats();
      
      if (stats.total === 0) {
        logger.debug('DLQ is empty, nothing to reprocess');
        return;
      }

      // Check circuit breaker status before reprocessing
      // If circuit breakers are OPEN, skip reprocessing to avoid adding items back to DLQ
      const cbStatus = await alarmProcessor.getCircuitBreakerStatus();
      const allBreakersClosed = 
        cbStatus.email.state === 'CLOSED' && 
        cbStatus.sms.state === 'CLOSED' && 
        cbStatus.voice.state === 'CLOSED';
      
      if (!allBreakersClosed) {
        // Check if at least one channel is available for the items we have
        const hasEmailItems = (stats.byChannel?.email || 0) > 0;
        const hasSmsItems = (stats.byChannel?.sms || 0) > 0;
        const hasVoiceItems = (stats.byChannel?.voice || 0) > 0;
        
        const emailAvailable = cbStatus.email.state === 'CLOSED';
        const smsAvailable = cbStatus.sms.state === 'CLOSED';
        const voiceAvailable = cbStatus.voice.state === 'CLOSED';
        
        const canProcessSomething = 
          (hasEmailItems && emailAvailable) ||
          (hasSmsItems && smsAvailable) ||
          (hasVoiceItems && voiceAvailable);
        
        if (!canProcessSomething) {
          logger.info(`Auto DLQ reprocess skipped: circuit breakers not ready`, {
            email: cbStatus.email.state,
            sms: cbStatus.sms.state,
            voice: cbStatus.voice.state,
            dlqTotal: stats.total
          });
          return;
        }
        
        // Process only items for available channels
        logger.info(`Auto DLQ reprocess: processing items for available channels only`, {
          emailAvailable,
          smsAvailable,
          voiceAvailable
        });
      }

      logger.info(`Auto DLQ reprocess: ${stats.total} items pending`, {
        byChannel: stats.byChannel,
        byErrorType: stats.byErrorType,
        averageAgeMinutes: Math.round(stats.averageAge / 60000)
      });

      // Process items with force=true to skip individual backoffs 
      // (the periodic interval provides the overall backoff)
      const result = await this.reprocessBatch({
        limit: this.AUTO_REPROCESS_BATCH_SIZE,
        force: true  // Skip per-item backoff since we're already on a schedule
      });

      if (result.processed > 0 || result.failed > 0) {
        logger.info(`Auto DLQ reprocess completed: ${result.processed} processed, ${result.failed} failed`, {
          errors: result.errors.slice(0, 5)  // Log first 5 errors
        });
      }

      // If there are still items, log for visibility
      const remainingStats = await this.getStats();
      if (remainingStats.total > 0) {
        logger.info(`DLQ: ${remainingStats.total} items remaining, will retry in ${this.AUTO_REPROCESS_INTERVAL_MS / 1000}s`);
      }
    } catch (error: any) {
      logger.error('Error in auto DLQ reprocess cycle:', error.message);
    } finally {
      this.isAutoReprocessing = false;
    }
  }

  /**
   * Stop automatic DLQ reprocessing
   */
  stopAutoReprocessing(): void {
    if (this.autoReprocessTimer) {
      clearInterval(this.autoReprocessTimer);
      this.autoReprocessTimer = null;
      logger.info('Stopped automatic DLQ reprocessing');
    }
  }
}

export default new DLQReprocessor();
