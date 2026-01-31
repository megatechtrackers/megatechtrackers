import db from '../db';
import alarmRepository from '../repositories/alarmRepository';
import channelRegistry from '../channels';
import logger from '../utils/logger';
import config from '../config';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { withRetry } from '../utils/retry';
import { validateAlarm } from '../utils/validation';
import metrics from '../utils/metrics';
import { Alarm, Contact, ChannelName } from '../types';
import { ChannelError, ValidationError } from '../utils/errors';
import pLimit from '../utils/pLimit';
import featureFlags from './featureFlags';
import smsModemPool from './smsModemPool';

class AlarmProcessor {
  private metricsInterval: NodeJS.Timeout | null = null;
  
  private emailCircuitBreaker: CircuitBreaker;
  private smsCircuitBreaker: CircuitBreaker;
  private voiceCircuitBreaker: CircuitBreaker;
  
  // Concurrency limiters for backpressure control
  private emailLimiter: ReturnType<typeof pLimit>;
  private smsLimiter: ReturnType<typeof pLimit>;
  private voiceLimiter: ReturnType<typeof pLimit>;

  constructor() {
    this.emailCircuitBreaker = new CircuitBreaker('email', {
      failureThreshold: config.circuitBreaker.failureThreshold,
      successThreshold: config.circuitBreaker.successThreshold,
      timeout: config.circuitBreaker.timeout
    });
    
    this.smsCircuitBreaker = new CircuitBreaker('sms', {
      failureThreshold: config.circuitBreaker.failureThreshold,
      successThreshold: config.circuitBreaker.successThreshold,
      timeout: config.circuitBreaker.timeout
    });
    
    this.voiceCircuitBreaker = new CircuitBreaker('voice', {
      failureThreshold: config.circuitBreaker.failureThreshold,
      successThreshold: config.circuitBreaker.successThreshold,
      timeout: config.circuitBreaker.timeout
    });
    
    // Initialize concurrency limiters
    this.emailLimiter = pLimit(config.channels.email.maxConcurrency);
    this.smsLimiter = pLimit(config.channels.sms.maxConcurrency);
    this.voiceLimiter = pLimit(config.channels.voice.maxConcurrency);
  }

  async initialize(): Promise<void> {
    try {
      await db.connect();
      await channelRegistry.initializeAll();
      
      // Start metrics interval for monitoring
      this.metricsInterval = setInterval(async () => {
        await this.logMetrics();
      }, 60000);
      
      logger.info('Alarm processor initialized successfully (RabbitMQ-based processing)');
      logger.info('Database polling disabled - using RabbitMQ for alarm processing');
    } catch (error) {
      logger.error('Failed to initialize alarm processor:', error);
      throw error;
    }
  }

  stop(): void {
    logger.info('Stopping alarm processor...');
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    logger.info('Alarm processor stopped');
  }

  async processAlarm(alarm: Alarm): Promise<void> {
    const startTime = Date.now();
    
    try {
      const validatedAlarm = validateAlarm(alarm);
      
      if (await alarmRepository.shouldDeduplicate(validatedAlarm, config.alarm.dedupWindowMinutes)) {
        logger.info(`Alarm deduplicated: ${alarm.id}`);
        await alarmRepository.markDeduplication(validatedAlarm);
        return;
      }
      
      if (await alarmRepository.isInQuietHours(alarm.imei)) {
        logger.info(`Alarm skipped (quiet hours): ${alarm.id}`);
        return;
      }
      
      const contacts = await alarmRepository.getDeviceContacts(alarm.imei, config);
      
      // Channel priority: email -> sms -> voice
      // Try channels in priority order, fallback to next if current fails
      const channelOrder: Array<{ channel: ChannelName; enabled: boolean; sent: boolean }> = [
        { channel: 'email', enabled: (alarm.is_email === true || alarm.is_email === 1), sent: alarm.email_sent },
        { channel: 'sms', enabled: (alarm.is_sms === true || alarm.is_sms === 1), sent: alarm.sms_sent },
        { channel: 'voice', enabled: (alarm.is_call === true || alarm.is_call === 1), sent: alarm.call_sent || false }
      ];
      
      const enabledChannels = channelOrder.filter(c => c.enabled && !c.sent);
      
      // Channel fallback behavior:
      // - If fallback is enabled: Try all enabled channels in parallel, but if one fails, 
      //   it doesn't fail the whole operation (graceful degradation)
      // - If fallback is disabled: Try all enabled channels in parallel (same behavior)
      // 
      // Note: Both email and SMS will be sent if both are enabled, regardless of fallback setting.
      // Fallback only affects error handling, not which channels are tried.
      const useFallback = featureFlags.isEnabled('channel_fallback_enabled');
      
      // Always try all enabled channels in parallel
      const tasks: Promise<void>[] = [];
      
      for (const channelInfo of enabledChannels) {
        const breaker = channelInfo.channel === 'email' ? this.emailCircuitBreaker :
                       channelInfo.channel === 'sms' ? this.smsCircuitBreaker :
                       this.voiceCircuitBreaker;
        
        // Wrap in a function that handles errors gracefully when fallback is enabled
        const sendTask = async () => {
          try {
            await this.sendNotification(validatedAlarm, contacts, channelInfo.channel, breaker);
          } catch (error) {
            if (useFallback) {
              // With fallback enabled, log the error but don't throw
              // This allows other channels to still succeed
              logger.warn(`Channel ${channelInfo.channel} failed (fallback enabled, continuing with other channels)`, {
                alarm_id: alarm.id,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            } else {
              // Without fallback, rethrow the error
              throw error;
            }
          }
        };
        
        tasks.push(sendTask());
      }
      
      await Promise.allSettled(tasks);
      
      metrics.incrementCounter('alarms_processed_total');
      
      const duration = Date.now() - startTime;
      metrics.recordHistogram('alarm_processing_duration_ms', duration);
    } catch (error) {
      logger.error(`Error processing alarm ${alarm.id}:`, error);
      metrics.incrementCounter('alarm_processing_error');
      
      if (error instanceof ValidationError) {
        await alarmRepository.addToDLQ(alarm, 'validation', (error as Error).message, 'VALIDATION_ERROR', 0);
      }
    }
  }

  private async sendNotification(alarm: Alarm, contacts: Contact[], channel: ChannelName, breaker: CircuitBreaker): Promise<void> {
    const recipients = channel === 'sms' || channel === 'voice'
      ? contacts.filter(c => c.phone).map(c => c.phone as string)
      : contacts.filter(c => c.email).map(c => c.email as string);
    
    if (recipients.length === 0) {
      logger.warn(`No ${channel} recipients for alarm ${alarm.id}`);
      return;
    }
    
    const channelObj = channelRegistry.get(channel);
    if (!channelObj || !channelObj.isReady()) {
      logger.warn(`Channel ${channel} not available for alarm ${alarm.id}`);
      return;
    }

    // Idempotency check: prevent duplicate sends
    const wasSent = await db.wasNotificationSent(alarm.id, channel);
    if (wasSent) {
      logger.info(`Alarm ${alarm.id} already sent via ${channel}, skipping (idempotency check)`);
      metrics.incrementCounter(`${channel}_send_skipped_duplicate`);
      return;
    }
    
    // Get channel-specific retry limit and concurrency limiter
    const channelConfig = config.channels[channel];
    const maxRetries = channelConfig.maxRetries;
    const limiter = channel === 'email' ? this.emailLimiter : 
                    channel === 'sms' ? this.smsLimiter : 
                    channel === 'voice' ? this.voiceLimiter :
                    pLimit(channelConfig.maxConcurrency);
    
    let attempts = 0;
    const sendStartTime = Date.now();
    
    try {
      // Apply channel-specific concurrency limit
      await limiter(async () => {
        await withRetry(
          async () => {
            attempts++;
            
            // Let circuit breaker handle recovery automatically - don't check isAvailable() here
            // The breaker.execute() will automatically transition from OPEN -> HALF_OPEN when timeout expires
            return await breaker.execute(async () => {
              const result = await channelObj.send(alarm, recipients);
              
              if (!result.success) {
                throw new Error(`${channel} send failed`);
              }
              
              await alarmRepository.markNotificationSent(alarm.id, channel);
              
              // Record attempts for audit trail (non-critical, don't fail on errors)
              for (const recipient of result.recipients) {
                try {
                  await alarmRepository.recordAttempt(
                    alarm.id, alarm.imei, alarm.gps_time, channel, recipient.recipient,
                    recipient.success ? 'success' : 'failed',
                    recipient.success ? null : 'Send failed',
                    recipient.providerId, result.provider,
                    // Include modem info for SMS channel (per-recipient or overall result)
                    channel === 'sms' ? (recipient.modemId || result.modemId || null) : null,
                    channel === 'sms' ? (recipient.modemName || result.modemName || null) : null
                  );
                } catch (recordError: any) {
                  logger.warn(`Failed to record ${channel} attempt for alarm ${alarm.id}: ${recordError.message}`);
                  // Don't throw - notification was already sent successfully
                }
              }
              
              const sendDuration = Date.now() - sendStartTime;
              metrics.incrementCounter(`${channel}_sent_total`);
              metrics.recordHistogram(`${channel}_send_duration_ms`, sendDuration);
              
              logger.info(`${channel.toUpperCase()} sent for alarm ${alarm.id}`, {
                alarm_id: alarm.id,
                recipients: recipients.length,
                provider: result.provider,
                message_id: result.messageId,
                duration: sendDuration
              });
              
              // Track SLA metrics (delivery time from alarm creation)
              // Handle both Date objects and string dates (from JSON parsing)
              let alarmCreatedAt: Date;
              try {
                if (alarm.created_at instanceof Date) {
                  alarmCreatedAt = alarm.created_at;
                } else if (alarm.created_at) {
                  alarmCreatedAt = new Date(alarm.created_at);
                } else if (alarm.server_time instanceof Date) {
                  alarmCreatedAt = alarm.server_time;
                } else if (alarm.server_time) {
                  alarmCreatedAt = new Date(alarm.server_time);
                } else {
                  alarmCreatedAt = new Date();
                }
                const deliveryTime = Date.now() - alarmCreatedAt.getTime();
                const deliveryMetricName = `notification_delivery_time_ms_${channel}`;
                metrics.recordHistogram(deliveryMetricName, deliveryTime);
              } catch (timeError: any) {
                logger.warn(`Could not calculate SLA metrics for alarm ${alarm.id}: ${timeError.message}`);
              }
              
              // Track cost metrics (configurable per channel)
              const costPerMessage = this.getChannelCost(channel);
              if (costPerMessage > 0) {
                const costMetricName = `notification_cost_total_${channel}`;
                metrics.incrementCounter(costMetricName, costPerMessage);
              }
              
              const countMetricName = `notification_count_by_channel_${channel}`;
              metrics.incrementCounter(countMetricName);
              
              return result;
            });
          },
          {
            maxRetries,
            baseDelay: this.calculateRetryDelay(config.alarm.retryBaseDelay, alarm.priority || 5),
            maxDelay: config.alarm.retryMaxDelay,
            shouldRetry: (error: any) => {
              // Retry if it's a retryable ChannelError
              if (error instanceof ChannelError && error.retryable) {
                return true;
              }
              // For circuit breaker errors, don't retry immediately
              // The circuit breaker will auto-recover after timeout, and the next alarm will try again
              // This prevents hammering the circuit breaker while it's OPEN
              if (error.code === 'CIRCUIT_BREAKER_OPEN') {
                // Don't retry circuit breaker errors - let the breaker recover on its own
                // The next alarm will automatically try when the breaker transitions to HALF_OPEN
                return false;
              }
              // For HALF_OPEN busy errors, also don't retry - wait for recovery
              if (error.code === 'CIRCUIT_BREAKER_HALF_OPEN_BUSY') {
                return false;
              }
              return false;
            },
            onRetry: (attempt: number, delay: number, error: any) => {
              logger.warn(`Retry ${attempt}/${maxRetries} for ${channel} on alarm ${alarm.id} in ${delay}ms`, {
                error: error.message,
                error_type: error instanceof ChannelError ? error.type : 'UNKNOWN'
              });
              metrics.incrementCounter(`${channel}_send_retry`);
            }
          }
        );
      });
    } catch (error: any) {
      logger.error(`Failed to send ${channel} after ${attempts} attempts for alarm ${alarm.id}:`, error);
      metrics.incrementCounter(`${channel}_send_error`);
      metrics.incrementCounter(`${channel}_send_failed_permanent`);
      
      // Track failure for success rate calculation (handled in logMetrics)
      
      await alarmRepository.recordAttempt(
        alarm.id, alarm.imei, alarm.gps_time, channel, recipients.join(','),
        'failed', error.message, null, null,
        null, null  // modemId and modemName not available for failures
      );
      
      const errorType: string = (error instanceof ChannelError && error.type) ? error.type : 'UNKNOWN_ERROR';
      await alarmRepository.addToDLQ(
        alarm, channel, error.message, errorType, attempts
      );
    }
  }

  private async logMetrics(): Promise<void> {
    try {
      const stats = await db.getAlarmStats();
      
      metrics.setGauge('pending_sms_count', parseInt(stats.pending_sms || '0'));
      metrics.setGauge('pending_email_count', parseInt(stats.pending_email || '0'));
      
      // Update channel availability metrics
      const emailChannel = channelRegistry.get('email');
      const smsChannel = channelRegistry.get('sms');
      const voiceChannel = channelRegistry.get('voice');
      
      metrics.setGauge('email_channel_available', emailChannel && emailChannel.isReady() ? 1 : 0);
      metrics.setGauge('sms_channel_available', smsChannel && smsChannel.isReady() ? 1 : 0);
      metrics.setGauge('voice_channel_available', voiceChannel && voiceChannel.isReady() ? 1 : 0);
      
      // Calculate and update success rates for each channel
      await this.updateChannelSuccessRates();
      
      // Calculate and update cost per message
      await this.updateChannelCosts();
      
      // Calculate SLA compliance
      await this.updateSLACompliance();
      
      logger.info('Circuit breaker status', {
        email: this.emailCircuitBreaker.getStatus(),
        sms: this.smsCircuitBreaker.getStatus(),
        voice: this.voiceCircuitBreaker.getStatus()
      });
    } catch (error) {
      logger.error('Error logging metrics:', error);
    }
  }
  
  /**
   * Calculate success rates for each channel
   */
  private async updateChannelSuccessRates(): Promise<void> {
    const channels: Array<'email' | 'sms' | 'voice'> = ['email', 'sms', 'voice'];
    
    for (const channel of channels) {
      try {
        // Query database for success rate over last hour
        const query = `
          SELECT 
            COUNT(*) FILTER (WHERE status = 'success' AND notification_type = $1 AND sent_at > NOW() - INTERVAL '1 hour') as success_count,
            COUNT(*) FILTER (WHERE notification_type = $1 AND sent_at > NOW() - INTERVAL '1 hour') as total_count
          FROM alarms_history
        `;
        
        const result = await db.query(query, [channel]);
        const row = result.rows[0];
        const successCount = parseInt(row.success_count) || 0;
        const totalCount = parseInt(row.total_count) || 0;
        
        if (totalCount > 0) {
          const successRate = successCount / totalCount;
          const metricName = `notification_success_rate_${channel}`;
          metrics.setGauge(metricName, successRate);
        }
      } catch (error) {
        logger.warn(`Error calculating success rate for ${channel}:`, error);
      }
    }
  }
  
  /**
   * Calculate average cost per message for each channel
   */
  private async updateChannelCosts(): Promise<void> {
    const channels: Array<'email' | 'sms' | 'voice'> = ['email', 'sms', 'voice'];
    
    for (const channel of channels) {
      try {
        const costPerMessage = this.getChannelCost(channel);
        const metricName = `notification_cost_per_message_${channel}`;
        metrics.setGauge(metricName, costPerMessage);
      } catch (error) {
        logger.warn(`Error calculating cost for ${channel}:`, error);
      }
    }
  }
  
  /**
   * Calculate SLA compliance (notifications delivered within SLA threshold)
   */
  private async updateSLACompliance(): Promise<void> {
    const channels: Array<'email' | 'sms' | 'voice'> = ['email', 'sms', 'voice'];
    const slaThresholds: { [key: string]: number } = {
      email: config.sla.emailThresholdMs,
      sms: config.sla.smsThresholdMs,
      voice: config.sla.voiceThresholdMs
    };
    
    for (const channel of channels) {
      try {
        const threshold = slaThresholds[channel];
        // Query database for SLA compliance
        const query = `
          SELECT 
            COUNT(*) FILTER (WHERE notification_type = $1 AND sent_at > NOW() - INTERVAL '1 hour' AND EXTRACT(EPOCH FROM (sent_at - created_at)) * 1000 <= $2) as compliant_count,
            COUNT(*) FILTER (WHERE notification_type = $1 AND sent_at > NOW() - INTERVAL '1 hour') as total_count
          FROM alarms_history
          JOIN alarms ON alarms_history.alarm_id = alarms.id
        `;
        
        const result = await db.query(query, [channel, threshold]);
        const row = result.rows[0];
        const compliantCount = parseInt(row.compliant_count) || 0;
        const totalCount = parseInt(row.total_count) || 0;
        
        if (totalCount > 0) {
          const complianceRate = compliantCount / totalCount;
          const metricName = `notification_sla_compliance_${channel}`;
          metrics.setGauge(metricName, complianceRate);
        }
      } catch (error) {
        logger.warn(`Error calculating SLA compliance for ${channel}:`, error);
      }
    }
  }

  async resetCircuitBreaker(channel: ChannelName): Promise<void> {
    if (channel === 'email') {
      this.emailCircuitBreaker.reset();
    } else if (channel === 'sms') {
      this.smsCircuitBreaker.reset();
    } else if (channel === 'voice') {
      this.voiceCircuitBreaker.reset();
    }
    logger.info(`Circuit breaker reset for ${channel}`);
  }

  async resetAllCircuitBreakers(): Promise<void> {
    this.emailCircuitBreaker.reset();
    this.smsCircuitBreaker.reset();
    this.voiceCircuitBreaker.reset();
    logger.info('All circuit breakers reset');
  }
  
  /**
   * Calculate retry delay based on alarm priority
   * Higher priority = shorter delay (faster retry)
   */
  private calculateRetryDelay(baseDelay: number, priority: number): number {
    // Priority 0-10, where 10 is highest
    // High priority (8-10): 0.5x delay (faster)
    // Medium priority (4-7): 1x delay (normal)
    // Low priority (0-3): 1.5x delay (slower)
    if (priority >= 8) {
      return Math.floor(baseDelay * 0.5);
    } else if (priority <= 3) {
      return Math.floor(baseDelay * 1.5);
    }
    return baseDelay;
  }
  
  /**
   * Get cost per message for a channel
   * For SMS: uses dynamic package-based cost from modem pool
   * For Email/Voice: uses static config values
   */
  private getChannelCost(channel: 'email' | 'sms' | 'voice'): number {
    if (channel === 'sms') {
      // Use dynamic cost from modem pool (package_cost / sms_limit)
      const dynamicCost = smsModemPool.getAverageCostPerSms();
      // Fall back to config if no modems configured
      return dynamicCost > 0 ? dynamicCost : config.cost.smsPerMessage;
    }
    
    const costs: { [key: string]: number } = {
      email: config.cost.emailPerMessage,
      voice: config.cost.voicePerMessage
    };
    return costs[channel] || 0;
  }
  

  async getCircuitBreakerStatus(): Promise<{ email: any; sms: any; voice: any }> {
    return {
      email: this.emailCircuitBreaker.getStatus(),
      sms: this.smsCircuitBreaker.getStatus(),
      voice: this.voiceCircuitBreaker.getStatus()
    };
  }

  async reprocessPendingAlarms(channel?: 'email' | 'sms' | 'voice' | 'all', limit: number = 100): Promise<{ processed: number; failed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;
    let failed = 0;

    try {
      // Get pending alarms from database
      const pendingAlarms = await db.getPendingAlarms(channel, limit);
      
      logger.info(`Reprocessing ${pendingAlarms.length} pending alarms`, { channel: channel || 'all' });

      for (const alarmData of pendingAlarms) {
        try {
          // Convert database row to Alarm object
          const alarm: Alarm = {
            id: alarmData.id,
            imei: alarmData.imei,
            server_time: new Date(alarmData.server_time || alarmData.created_at),
            gps_time: new Date(alarmData.gps_time || alarmData.created_at),
            latitude: parseFloat(alarmData.latitude),
            longitude: parseFloat(alarmData.longitude),
            altitude: parseInt(alarmData.altitude || 0),
            angle: parseInt(alarmData.angle || 0),
            satellites: parseInt(alarmData.satellites || 0),
            speed: parseInt(alarmData.speed || 0),
            status: alarmData.status,
            is_sms: alarmData.is_sms === 1 || alarmData.is_sms === true,
            is_email: alarmData.is_email === 1 || alarmData.is_email === true,
            is_call: alarmData.is_call === 1 || alarmData.is_call === true,
            is_valid: alarmData.is_valid === 1 || alarmData.is_valid === true,
            sms_sent: alarmData.sms_sent === true || alarmData.sms_sent === 1,
            email_sent: alarmData.email_sent === true || alarmData.email_sent === 1,
            call_sent: alarmData.call_sent === true || alarmData.call_sent === 1,
            reference_id: alarmData.reference_id,
            distance: alarmData.distance,
            created_at: new Date(alarmData.created_at)
          };

          // Process the alarm
          await this.processAlarm(alarm);
          processed++;
        } catch (error: any) {
          failed++;
          const errorMsg = `Failed to reprocess alarm ${alarmData.id}: ${error.message}`;
          errors.push(errorMsg);
          logger.error(errorMsg);
        }
      }

      logger.info(`Reprocessing completed: ${processed} processed, ${failed} failed`);
      return { processed, failed, errors: errors.slice(0, 10) }; // Limit errors to first 10
    } catch (error: any) {
      logger.error('Error in reprocessPendingAlarms:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down alarm processor...');
    
    this.stop();
    
    // Note: No need to wait for batch processing since we're using RabbitMQ
    // RabbitMQ handles message acknowledgment and retries
    
    await channelRegistry.closeAll();
    await db.close();
    
    logger.info('Alarm processor shut down successfully');
  }
}

export default new AlarmProcessor();
