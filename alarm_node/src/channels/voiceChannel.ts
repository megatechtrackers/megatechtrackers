import { BaseChannel } from './baseChannel';
import axios from 'axios';
import logger from '../utils/logger';
import { ValidationError, ProviderError, ConfigurationError, RateLimitError, classifyError } from '../utils/errors';
import { Alarm, DeliveryResult } from '../types';
import rateLimiter from '../services/rateLimiter';
import featureFlags from '../services/featureFlags';

/**
 * Voice Call Channel
 * 
 * Makes voice calls to notify recipients of alarms
 * Uses external voice API service
 */
export class VoiceChannel extends BaseChannel {
  private apiUrl: string;
  private apiKey: string;
  private from: string;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isHealthy: boolean = true;
  private lastHealthCheck: Date | null = null;

  constructor() {
    super('voice');
    this.apiUrl = process.env.VOICE_API_URL || '';
    this.apiKey = process.env.VOICE_API_KEY || '';
    this.from = process.env.VOICE_FROM || 'TrackingAlarm';
  }

  async initialize(): Promise<void> {
    try {
      if (!this.apiUrl || !this.apiKey) {
        logger.warn('Voice channel configuration incomplete. Voice calls will be disabled.');
        this.initialized = false;
        return;
      }

      // Perform initial health check
      await this.performHealthCheck();

      // Set up periodic health checks
      this.healthCheckInterval = setInterval(() => {
        this.performHealthCheck().catch(error => {
          logger.error('Health check error:', error);
        });
      }, 60000); // Check every minute

      this.initialized = true;
      logger.info('Voice channel initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize voice channel:', error);
      this.initialized = false;
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const response = await axios.get(`${this.apiUrl}/health`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        timeout: 5000,
      });

      this.isHealthy = response.status === 200;
      this.lastHealthCheck = new Date();
      
      if (!this.isHealthy) {
        logger.warn('Voice API health check failed', { status: response.status });
      }
    } catch (error: any) {
      this.isHealthy = false;
      this.lastHealthCheck = new Date();
      logger.warn('Voice API health check error:', error.message);
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

  async send(alarm: Alarm, recipients: string[]): Promise<DeliveryResult> {
    if (!this.initialized) {
      throw new ConfigurationError('Voice channel not initialized');
    }

    if (!this.isHealthy) {
      throw new ProviderError('Voice API is currently unavailable', 503);
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
        const rateLimitResult = await rateLimiter.checkVoiceLimit(phoneNumber);
        if (!rateLimitResult.allowed) {
          throw new RateLimitError(
            `Rate limit exceeded for ${phoneNumber}. Retry after ${rateLimitResult.retryAfter}s`,
            rateLimitResult.retryAfter
          );
        }
      }
    }

    const message = this.generateVoiceMessage(alarm);

    const results = await Promise.allSettled(
      valid.map(phone => this.makeCall(phone, message, alarm))
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

    if (successCount === 0) {
      const firstFailure = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      throw firstFailure.reason;
    }

    return {
      success: true,
      messageId: null,
      provider: 'voice-api',
      recipients: results.map((r, i) => ({
        recipient: valid[i],
        success: r.status === 'fulfilled' && r.value.success,
        providerId: r.status === 'fulfilled' ? r.value.callId : null
      }))
    };
  }

  private async makeCall(phoneNumber: string, message: string, alarm: Alarm): Promise<{ success: boolean; callId: string | null }> {
    try {
      const payload = {
        to: phoneNumber,
        from: this.from,
        message: message,
        alarm_id: alarm.id,
        imei: alarm.imei,
      };

      const response = await axios.post(`${this.apiUrl}/calls`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        timeout: 30000, // Voice calls may take longer
      });

      logger.info(`Voice call initiated to ${phoneNumber}`, {
        alarm_id: alarm.id,
        imei: alarm.imei,
        status: response.status,
      });

      return {
        success: true,
        callId: response.data?.call_id || response.data?.id || null
      };
    } catch (error: any) {
      // Classify the error using enhanced error taxonomy
      const classifiedError = classifyError(error);
      
      // Track failures for health monitoring
      if (classifiedError.retryable && classifiedError.type === 'PROVIDER') {
        this.isHealthy = false;
        logger.warn('Voice API marked as unhealthy', {
          errorType: classifiedError.type,
          errorCategory: classifiedError.category
        });
      }
      
      throw classifiedError;
    }
  }

  private generateVoiceMessage(alarm: Alarm): string {
    return `Alarm ${alarm.id}. Device ${alarm.imei}. Status ${alarm.status}. Location ${alarm.latitude.toFixed(4)}, ${alarm.longitude.toFixed(4)}.`;
  }

  getHealthStatus(): { healthy: boolean; lastCheck: Date | null } {
    return {
      healthy: this.isHealthy,
      lastCheck: this.lastHealthCheck
    };
  }

  async close(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    logger.info('Voice channel closed');
  }
}
