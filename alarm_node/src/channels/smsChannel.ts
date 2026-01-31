import { BaseChannel } from './baseChannel';
import logger from '../utils/logger';
import { ValidationError, ConfigurationError, RateLimitError } from '../utils/errors';
import { Alarm, DeliveryResult } from '../types';
import templateVersioning from '../services/templateVersioning';
import rateLimiter from '../services/rateLimiter';
import featureFlags from '../services/featureFlags';
import smsModemPool from '../services/smsModemPool';

interface SmsValidation {
  length: number;
  hasUnicode: boolean;
  segmentSize: number;
  segments: number;
  valid: boolean;
}

export class SmsChannel extends BaseChannel {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isHealthy: boolean = true;
  private lastHealthCheck: Date | null = null;
  private consecutiveFailures: number = 0;

  constructor() {
    super('sms');
  }

  async initialize(): Promise<void> {
    try {
      // Initialize the SMS modem pool
      await smsModemPool.initialize();

      // Perform initial health check
      await this.performHealthCheck();

      // Set up periodic health checks
      this.healthCheckInterval = setInterval(() => {
        this.performHealthCheck().catch(error => {
          logger.error('SMS health check error:', error);
        });
      }, 60000); // Check every minute

      this.initialized = true;
      logger.info('SMS channel initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SMS channel:', error);
      this.initialized = false;
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Get pool status from modem pool (now async - queries DB for fresh data)
      const poolStatus = await smsModemPool.getPoolStatus();
      
      // Consider healthy if:
      // - In mock mode (for testing)
      // - At least 1 healthy modem available
      const hasHealthyModems = poolStatus.healthyModems > 0;
      const inMockMode = poolStatus.isMockMode;
      
      this.isHealthy = inMockMode || hasHealthyModems;
      this.lastHealthCheck = new Date();
      
      if (this.isHealthy) {
        this.consecutiveFailures = 0;
      } else {
        this.consecutiveFailures++;
        logger.warn(`SMS channel unhealthy: ${poolStatus.healthyModems}/${poolStatus.totalModems} modems available`);
      }
    } catch (error: any) {
      this.consecutiveFailures++;
      
      // Mark as unhealthy after 3 consecutive failures
      if (this.consecutiveFailures >= 3) {
        this.isHealthy = false;
        logger.warn(`SMS channel marked as unhealthy after ${this.consecutiveFailures} consecutive failures`);
      }
      
      this.lastHealthCheck = new Date();
      logger.debug('SMS health check failed', { 
        error: error.message,
        consecutiveFailures: this.consecutiveFailures 
      });
    }
  }

  validateRecipients(recipients: string[]): { valid: string[]; invalid: string[] } {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const valid: string[] = [];
    const invalid: string[] = [];

    recipients.forEach(phone => {
      if (phoneRegex.test(phone)) {
        valid.push(phone);
      } else {
        invalid.push(phone);
      }
    });

    return { valid, invalid };
  }

  private validateSmsContent(message: string): SmsValidation {
    const hasUnicode = /[^\x00-\x7F]/.test(message);
    const segmentSize = hasUnicode ? 70 : 160;
    const segments = Math.ceil(message.length / segmentSize);

    return {
      length: message.length,
      hasUnicode,
      segmentSize,
      segments,
      valid: segments <= 3
    };
  }

  async send(alarm: Alarm, recipients: string[]): Promise<DeliveryResult> {
    if (!this.initialized) {
      throw new ConfigurationError('SMS channel not initialized');
    }

    if (!this.isHealthy) {
      logger.warn('SMS API is currently unhealthy, attempting send anyway');
    }

    if (!recipients || recipients.length === 0) {
      throw new ValidationError('No phone numbers provided');
    }

    const { valid, invalid } = this.validateRecipients(recipients);
    if (invalid.length > 0) {
      throw new ValidationError(`Invalid phone numbers: ${invalid.join(', ')}`);
    }

    // Check rate limits for each recipient
    if (featureFlags.isEnabled('rate_limiting_enabled')) {
      for (const phoneNumber of valid) {
        const rateLimitResult = await rateLimiter.checkSmsLimit(phoneNumber);
        if (!rateLimitResult.allowed) {
          throw new RateLimitError(
            `Rate limit exceeded for ${phoneNumber}. Retry after ${rateLimitResult.retryAfter}s`,
            rateLimitResult.retryAfter
          );
        }
      }
    }

    // Render template using template versioning service
    let message: string;
    try {
      const rendered = await templateVersioning.renderTemplate('sms', 'alarm', alarm);
      message = rendered.body;
    } catch (error: any) {
      // Fallback to default template if versioning fails
      logger.warn(`Template versioning failed, using default: ${error.message}`);
      message = this.generateSmsMessage(alarm);
    }
    
    const contentValidation = this.validateSmsContent(message);
    if (!contentValidation.valid) {
      logger.warn(`SMS message too long: ${contentValidation.segments} segments`, {
        alarm_id: alarm.id,
        length: contentValidation.length
      });
    }

    const results = await Promise.allSettled(
      valid.map(phone => this.sendSms(phone, message, alarm))
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

    if (successCount === 0) {
      const firstFailure = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      throw firstFailure.reason;
    }

    // Get modem info from first successful result
    const firstSuccess = results.find(r => r.status === 'fulfilled' && r.value.success) as PromiseFulfilledResult<{ success: boolean; messageId: string | null; modemId: number | null; modemName: string | null }> | undefined;

    return {
      success: true,
      messageId: null,
      provider: 'sms-api',
      modemId: firstSuccess?.value.modemId || null,
      modemName: firstSuccess?.value.modemName || null,
      recipients: results.map((r, i) => ({
        recipient: valid[i],
        success: r.status === 'fulfilled' && r.value.success,
        providerId: r.status === 'fulfilled' ? r.value.messageId : null,
        modemId: r.status === 'fulfilled' ? r.value.modemId : null,
        modemName: r.status === 'fulfilled' ? r.value.modemName : null
      }))
    };
  }

  private async sendSms(phoneNumber: string, message: string, alarm: Alarm): Promise<{ success: boolean; messageId: string | null; modemId: number | null; modemName: string | null }> {
    try {
      // Use modem pool to send SMS (automatically handles mock/real mode)
      // Pass service type 'alarms' and device IMEI for hybrid routing
      const result = await smsModemPool.sendSms(phoneNumber, message, {
        service: 'alarms',
        imei: alarm.imei
      });

      if (result.success) {
        // Reset failure count on successful send
        if (this.consecutiveFailures > 0) {
          this.consecutiveFailures = 0;
          if (!this.isHealthy) {
            this.isHealthy = true;
            logger.info('SMS channel recovered, marked as healthy');
          }
        }

        logger.info(`SMS sent successfully to ${phoneNumber}`, {
          alarm_id: alarm.id,
          imei: alarm.imei,
          modem_id: result.modemId,
          modem_name: result.modemName,
          mode: smsModemPool.isMockMode() ? 'mock' : 'real',
        });

        return {
          success: true,
          messageId: result.messageId || null,
          modemId: result.modemId || null,
          modemName: result.modemName || null
        };
      } else {
        // SMS sending failed
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= 3) {
          this.isHealthy = false;
          logger.warn('SMS channel marked as unhealthy', {
            consecutiveFailures: this.consecutiveFailures
          });
        }
        
        throw new Error(result.error || 'SMS sending failed');
      }
    } catch (error: any) {
      // Track failures for health monitoring
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 3) {
        this.isHealthy = false;
        logger.warn('SMS channel marked as unhealthy', {
          consecutiveFailures: this.consecutiveFailures,
          error: error.message
        });
      }
      
      throw error;
    }
  }

  private generateSmsMessage(alarm: Alarm): string {
    const googleMapsUrl = `https://maps.google.com/?q=${alarm.latitude},${alarm.longitude}`;
    
    const message = `Alarm #${alarm.id}: ${alarm.status}
Device: ${alarm.imei}
Time: ${new Date(alarm.server_time).toLocaleTimeString()}
Location: ${alarm.latitude.toFixed(5)}, ${alarm.longitude.toFixed(5)}
Speed: ${alarm.speed} km/h
Map: ${googleMapsUrl}`;

    return message.trim();
  }

  getHealthStatus(): { healthy: boolean; lastCheck: Date | null; consecutiveFailures: number } {
    return {
      healthy: this.isHealthy,
      lastCheck: this.lastHealthCheck,
      consecutiveFailures: this.consecutiveFailures
    };
  }

  async close(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Shutdown modem pool
    smsModemPool.shutdown();
    
    logger.info('SMS channel closed');
  }
}
