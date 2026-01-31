import { BaseChannel } from './baseChannel';
// @ts-ignore - firebase-admin needs to be installed via npm install firebase-admin
import * as admin from 'firebase-admin';
import logger from '../utils/logger';
import { ValidationError, ConfigurationError, ProviderError } from '../utils/errors';
import { Alarm, DeliveryResult } from '../types';
import configurationService from '../services/configurationService';
import db from '../db';
import metrics from '../utils/metrics';

/**
 * Push Notification Channel
 * 
 * Sends push notifications to mobile apps (React Native) and web apps (Next.js)
 * via Firebase Cloud Messaging (FCM)
 */

interface PushRecipient {
  userId: string;
  deviceToken: string;
  deviceType: 'ios' | 'android' | 'web';
}

export class PushChannel extends BaseChannel {
  private firebaseApp: admin.app.App | null = null;
  private messaging: admin.messaging.Messaging | null = null;

  constructor() {
    super('push');
  }

  async initialize(): Promise<void> {
    try {
      // Load Firebase config from database
      const config = await configurationService.getChannelConfigByMode('push', false);
      
      if (!config.firebase_project_id || !config.firebase_private_key || !config.firebase_client_email) {
        logger.warn('Firebase credentials not configured - push notifications will be disabled');
        this.initialized = false;
        return;
      }

      // Initialize Firebase Admin SDK
      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.firebase_project_id,
          privateKey: config.firebase_private_key.replace(/\\n/g, '\n'),
          clientEmail: config.firebase_client_email,
        }),
      }, 'alarm-service-push');

      this.messaging = admin.messaging(this.firebaseApp);

      this.initialized = true;
      logger.info('Push notification channel initialized successfully');
    } catch (error: any) {
      logger.error('Failed to initialize push notification channel:', error);
      this.initialized = false;
      // Don't throw - allow service to start without push notifications
    }
  }

  /**
   * Validate recipients - not really applicable for push, but required by BaseChannel
   */
  validateRecipients(recipients: string[]): { valid: string[]; invalid: string[] } {
    // For push notifications, recipients are user IDs
    // We'll validate by checking if they have registered device tokens
    return { valid: recipients, invalid: [] };
  }

  /**
   * Get device tokens for user IDs
   */
  private async getDeviceTokensForUsers(userIds: string[]): Promise<PushRecipient[]> {
    try {
      const result = await db.query(
        `SELECT user_id, device_token, device_type 
         FROM alarms_push_tokens 
         WHERE user_id = ANY($1)
         AND device_token IS NOT NULL
         AND device_token != ''
         ORDER BY last_used_at DESC`,
        [userIds]
      ) as { rows: Array<{ user_id: string; device_token: string; device_type: string }> };

      return result.rows.map(row => ({
        userId: row.user_id,
        deviceToken: row.device_token,
        deviceType: row.device_type as 'ios' | 'android' | 'web',
      }));
    } catch (error: any) {
      logger.error('Failed to fetch device tokens:', error);
      return [];
    }
  }

  /**
   * Send push notification
   */
  async send(alarm: Alarm, recipients: string[]): Promise<DeliveryResult> {
    if (!this.initialized || !this.messaging) {
      throw new ConfigurationError('Push notification channel not initialized');
    }

    if (!recipients || recipients.length === 0) {
      throw new ValidationError('No recipients provided');
    }

    // Get device tokens for recipients
    const pushRecipients = await this.getDeviceTokensForUsers(recipients);
    
    if (pushRecipients.length === 0) {
      throw new ValidationError('No device tokens found for recipients');
    }

    // Render notification template
    let title: string;
    let body: string;
    
    // Use default template for push notifications
    // Template versioning doesn't support 'push' channel yet
    title = `🚨 Alarm: ${alarm.status}`;
    body = this.getDefaultNotificationBody(alarm);

    // Prepare notification payload
    const notificationPayload: admin.messaging.Notification = {
      title,
      body,
    };

    // Prepare data payload (all values must be strings for FCM)
    const dataPayload: { [key: string]: string } = {
      alarm_id: String(alarm.id),
      imei: String(alarm.imei),
      status: String(alarm.status),
      latitude: String(alarm.latitude),
      longitude: String(alarm.longitude),
      speed: String(alarm.speed),
      timestamp: alarm.server_time.toISOString(),
      type: 'alarm',
    };

    // Send to all device tokens
    const results = await Promise.allSettled(
      pushRecipients.map(recipient => 
        this.sendToDevice(recipient, notificationPayload, dataPayload)
      )
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    
    // Track metrics
    metrics.incrementCounter('push_notifications_sent_total', { 
      status: successCount > 0 ? 'success' : 'failed' 
    });

    if (successCount === 0) {
      const firstFailure = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      throw firstFailure.reason;
    }

    logger.info(`Push notifications sent: ${successCount}/${pushRecipients.length}`, {
      alarm_id: alarm.id,
      imei: alarm.imei,
    });

    return {
      success: true,
      messageId: null,
      provider: 'firebase-fcm',
      recipients: results.map((r, i) => ({
        recipient: pushRecipients[i].userId,
        success: r.status === 'fulfilled' && r.value.success,
        providerId: r.status === 'fulfilled' ? r.value.messageId : null,
      })),
    };
  }

  /**
   * Send notification to a single device
   */
  private async sendToDevice(
    recipient: PushRecipient,
    notification: admin.messaging.Notification,
    data: { [key: string]: string }
  ): Promise<{ success: boolean; messageId: string | null }> {
    if (!this.messaging) {
      throw new ConfigurationError('Messaging not initialized');
    }

    try {
      const message: admin.messaging.Message = {
        token: recipient.deviceToken,
        notification,
        data,
        // Platform-specific configurations
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'alarms',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        webpush: {
          notification: {
            icon: '/icons/alarm-icon.png',
            badge: '/icons/badge-icon.png',
            requireInteraction: true,
          },
        },
      };

      const messageId = await this.messaging.send(message);
      
      // Update last_used_at for the device token
      await this.updateDeviceTokenUsage(recipient.deviceToken);
      
      logger.debug(`Push notification sent to ${recipient.userId} (${recipient.deviceType})`, {
        messageId,
        deviceType: recipient.deviceType,
      });

      return { success: true, messageId };
    } catch (error: any) {
      // Handle invalid token errors
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        logger.warn(`Invalid device token for user ${recipient.userId}, removing from database`);
        await this.removeInvalidDeviceToken(recipient.deviceToken);
      }
      
      logger.error(`Failed to send push notification to ${recipient.userId}:`, error);
      throw new ProviderError(`FCM error: ${error.message}`, error.code);
    }
  }

  /**
   * Update last_used_at timestamp for device token
   */
  private async updateDeviceTokenUsage(deviceToken: string): Promise<void> {
    try {
      await db.query(
        'UPDATE alarms_push_tokens SET last_used_at = NOW() WHERE device_token = $1',
        [deviceToken]
      );
    } catch (error: any) {
      logger.error('Failed to update device token usage:', error);
    }
  }

  /**
   * Remove invalid device token from database
   */
  private async removeInvalidDeviceToken(deviceToken: string): Promise<void> {
    try {
      await db.query(
        'DELETE FROM alarms_push_tokens WHERE device_token = $1',
        [deviceToken]
      );
      logger.info(`Removed invalid device token: ${deviceToken}`);
    } catch (error: any) {
      logger.error('Failed to remove invalid device token:', error);
    }
  }

  /**
   * Generate default notification body
   */
  private getDefaultNotificationBody(alarm: Alarm): string {
    return `Device ${alarm.imei} triggered ${alarm.status} at ${alarm.speed} km/h`;
  }

  /**
   * Register a device token for push notifications
   */
  async registerDeviceToken(
    userId: string,
    deviceToken: string,
    deviceType: 'ios' | 'android' | 'web'
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO alarms_push_tokens (user_id, device_token, device_type, last_used_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (device_token) 
         DO UPDATE SET user_id = $1, device_type = $3, last_used_at = NOW()`,
        [userId, deviceToken, deviceType]
      );
      
      logger.info(`Registered device token for user ${userId} (${deviceType})`);
    } catch (error: any) {
      logger.error('Failed to register device token:', error);
      throw error;
    }
  }

  /**
   * Unregister a device token
   */
  async unregisterDeviceToken(deviceToken: string): Promise<void> {
    try {
      await db.query(
        'DELETE FROM alarms_push_tokens WHERE device_token = $1',
        [deviceToken]
      );
      
      logger.info(`Unregistered device token: ${deviceToken}`);
    } catch (error: any) {
      logger.error('Failed to unregister device token:', error);
      throw error;
    }
  }

  /**
   * Get device tokens for a user
   */
  async getDeviceTokens(userId: string): Promise<PushRecipient[]> {
    return this.getDeviceTokensForUsers([userId]);
  }

  async close(): Promise<void> {
    if (this.firebaseApp) {
      await this.firebaseApp.delete();
      this.firebaseApp = null;
      this.messaging = null;
      logger.info('Push notification channel closed');
    }
  }
}
