import { BaseChannel } from './baseChannel';
import * as nodemailer from 'nodemailer';
import config from '../config';
import logger from '../utils/logger';
import { ValidationError, ProviderError, NetworkError, ConfigurationError, RateLimitError } from '../utils/errors';
import { Alarm, DeliveryResult } from '../types';
import templateVersioning from '../services/templateVersioning';
import rateLimiter from '../services/rateLimiter';
import rateLimiterDomain from '../services/rateLimiterDomain';
import featureFlags from '../services/featureFlags';
import systemStateManager from '../services/systemState';
import configurationService from '../services/configurationService';
import { decrypt, isEncrypted } from '../utils/encryption';

export class EmailChannel extends BaseChannel {
  private transporter: nodemailer.Transporter | null = null;
  private mockTransporter: nodemailer.Transporter | null = null;

  constructor() {
    super('email');
  }

  async initialize(): Promise<void> {
    try {
      // Initialize mock transporter (MailHog)
      await this.initializeMockTransporter();
      
      // Initialize real transporter from database config
      await this.initializeRealTransporter();
      
      this.initialized = true;
      logger.info('Email channel initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email channel:', error);
      this.initialized = false;
      // Don't throw - allow service to start without email
    }
  }

  /**
   * Initialize mock email transporter (MailHog)
   */
  private async initializeMockTransporter(): Promise<void> {
    try {
      const mockConfig = await configurationService.getChannelConfigByMode('email', true);
      
      this.mockTransporter = nodemailer.createTransport({
        host: mockConfig.smtp_host || 'mailhog',
        port: parseInt(mockConfig.smtp_port || '1025', 10),
        secure: false,
        auth: mockConfig.smtp_user && mockConfig.smtp_password ? {
          user: mockConfig.smtp_user,
          pass: mockConfig.smtp_password,
        } : undefined,
        tls: {
          rejectUnauthorized: false,
        },
      });
      
      logger.info('Mock email transporter (MailHog) initialized');
    } catch (error: any) {
      logger.error('Failed to initialize mock email transporter:', error);
    }
  }

  /**
   * Initialize real email transporter from database config
   */
  private async initializeRealTransporter(): Promise<void> {
    try {
      const realConfig = await configurationService.getChannelConfigByMode('email', false);
      
      // Decrypt password if needed
      let password = realConfig.smtp_password;
      if (password && isEncrypted(password)) {
        password = decrypt(password);
      }
      
      // Fallback to env vars if DB config is incomplete
      const host = realConfig.smtp_host || config.email.host;
      const port = realConfig.smtp_port ? parseInt(realConfig.smtp_port, 10) : config.email.port;
      const secure = realConfig.smtp_secure === 'true' || (realConfig.smtp_secure === undefined && config.email.secure);
      const user = realConfig.smtp_user || config.email.auth.user;
      const pass = password || config.email.auth.pass;
      
      if (!user || !pass) {
        logger.warn('Real email credentials not configured - will use mock mode only');
        return;
      }
      
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 10,
        // Connection timeouts for graceful handling
        connectionTimeout: 10000, // 10s connection timeout
        greetingTimeout: 10000,   // 10s greeting timeout
        socketTimeout: 30000      // 30s socket timeout
      });

      // Try to verify SMTP connection, but don't fail if it's down
      try {
        await this.transporter.verify();
        logger.info('Real email transporter initialized successfully');
      } catch (verifyError: any) {
        // SMTP server might be down at startup - that's OK, we'll retry on send
        logger.warn(`Real email transporter: SMTP verification failed (${verifyError.message}), will retry on send`);
      }
    } catch (error: any) {
      logger.error('Failed to initialize real email transporter:', error);
    }
  }

  validateRecipients(recipients: string[]): { valid: string[]; invalid: string[] } {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid: string[] = [];
    const invalid: string[] = [];

    recipients.forEach(email => {
      if (emailRegex.test(email)) {
        valid.push(email);
      } else {
        invalid.push(email);
      }
    });

    return { valid, invalid };
  }

  async send(alarm: Alarm, recipients: string[]): Promise<DeliveryResult> {
    if (!this.initialized) {
      throw new ConfigurationError('Email channel not initialized');
    }

    // Select transporter based on mock mode
    const isMockMode = systemStateManager.isMockMode('email');
    const transporter = isMockMode ? this.mockTransporter : this.transporter;
    
    if (!transporter) {
      throw new ConfigurationError(
        isMockMode 
          ? 'Mock email transporter not initialized' 
          : 'Real email transporter not initialized'
      );
    }

    if (!recipients || recipients.length === 0) {
      throw new ValidationError('No recipients provided');
    }

    const { valid, invalid } = this.validateRecipients(recipients);
    if (invalid.length > 0) {
      throw new ValidationError(`Invalid email addresses: ${invalid.join(', ')}`);
    }

    // Check rate limits for each recipient
    if (featureFlags.isEnabled('rate_limiting_enabled')) {
      for (const recipient of valid) {
        // Check Redis-based rate limit
        const rateLimitResult = await rateLimiter.checkEmailLimit(recipient);
        if (!rateLimitResult.allowed) {
          throw new RateLimitError(
            `Rate limit exceeded for ${recipient}. Retry after ${rateLimitResult.retryAfter}s`,
            rateLimitResult.retryAfter
          );
        }
        
        // Check domain-based rate limit
        const canSend = await rateLimiterDomain.canSend(recipient);
        if (!canSend) {
          throw new RateLimitError(
            `Domain rate limit exceeded for ${recipient}`,
            60 // Retry after 1 minute
          );
        }
      }
    }

    // Render template using template versioning service
    let subject: string;
    let htmlContent: string;
    let textContent: string;
    
    try {
      const rendered = await templateVersioning.renderTemplate('email', 'alarm', alarm);
      subject = rendered.subject || `🚨 Alarm: ${alarm.status} - Device ${alarm.imei}`;
      htmlContent = rendered.body;
      textContent = rendered.body.replace(/<[^>]*>/g, '');
    } catch (error: any) {
      // Fallback to default template if versioning fails
      logger.warn(`Template versioning failed, using default: ${error.message}`);
      subject = `🚨 Alarm: ${alarm.status} - Device ${alarm.imei}`;
      htmlContent = this.getDefaultHtmlTemplate(alarm);
      const displayTz = await this.getDisplayTimezone();
      textContent = this.getDefaultTextTemplate(alarm, displayTz);
    }

    const mailOptions: nodemailer.SendMailOptions = {
      from: config.email.from,
      to: valid.join(', '),
      subject,
      text: textContent,
      html: htmlContent,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      
      // Record successful sends for rate limiting
      if (featureFlags.isEnabled('rate_limiting_enabled')) {
        for (const recipient of valid) {
          rateLimiterDomain.recordSend(recipient);
        }
      }
      
      const mode = isMockMode ? 'mock' : 'real';
      logger.info(`Email sent successfully via ${mode} mode: ${info.messageId}`, {
        alarm_id: alarm.id,
        imei: alarm.imei,
        recipients: valid,
        mode,
      });
      
      return {
        success: true,
        messageId: info.messageId,
        provider: isMockMode ? 'mailhog' : 'nodemailer',
        recipients: valid.map(r => ({ recipient: r, success: true, providerId: info.messageId }))
      };
    } catch (error: any) {
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        throw new NetworkError(`Network error: ${error.message}`, error.code);
      }
      
      if (error.responseCode) {
        if (error.responseCode >= 500) {
          throw new ProviderError(error.message, error.responseCode);
        }
        if (error.responseCode >= 400 && error.responseCode < 500) {
          throw new ValidationError(`SMTP error: ${error.message}`);
        }
      }
      
      throw new ProviderError(error.message, 500);
    }
  }


  private getDefaultHtmlTemplate(alarm: Alarm): string {
    const googleMapsUrl = `https://www.google.com/maps?q=${alarm.latitude},${alarm.longitude}`;
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #d32f2f; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>🚨 Vehicle Alarm #${alarm.id}</h1></div>
          <div class="content">
            <p><strong>Device:</strong> ${alarm.imei}</p>
            <p><strong>Status:</strong> ${alarm.status}</p>
            <p><strong>Location:</strong> ${alarm.latitude}, ${alarm.longitude}</p>
            <p><a href="${googleMapsUrl}" target="_blank">View on Google Maps</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get display timezone for formatting dates in default template (Email Display Timezone from config).
   */
  private async getDisplayTimezone(): Promise<string> {
    try {
      const emailConfig = await configurationService.getChannelConfigByMode('email', false);
      if (emailConfig?.display_timezone) return emailConfig.display_timezone;
    } catch {
      // fallback to env
    }
    return config.email.displayTimezone || 'UTC';
  }

  private getDefaultTextTemplate(alarm: Alarm, displayTimezone: string): string {
    const googleMapsUrl = `https://www.google.com/maps?q=${alarm.latitude},${alarm.longitude}`;
    const timeStr = new Date(alarm.server_time).toLocaleString('en-US', {
      timeZone: displayTimezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    return `🚨 Alarm #${alarm.id}: ${alarm.status}
Device: ${alarm.imei}
Time: ${timeStr}
Location: ${alarm.latitude.toFixed(5)}, ${alarm.longitude.toFixed(5)}
Speed: ${alarm.speed} km/h
Map: ${googleMapsUrl}`;
  }

  /**
   * Send a system email (for AlertManager, admin notifications, etc.)
   * This bypasses the normal alarm flow and sends directly
   */
  async sendSystemEmail(options: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.initialized) {
      return { success: false, error: 'Email channel not initialized' };
    }

    const transporter = this.getActiveTransporter();
    if (!transporter) {
      return { success: false, error: 'No email transporter available' };
    }

    try {
      const fromAddress = systemStateManager.isMockMode('email')
        ? 'system@mock.local'
        : config.email?.from || 'system@megatechtrackers.com';

      await transporter.sendMail({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html || options.text,
      });

      logger.info(`System email sent to ${options.to}: ${options.subject}`);
      return { success: true };
    } catch (error: any) {
      logger.error(`Failed to send system email to ${options.to}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the active transporter based on mock mode
   */
  private getActiveTransporter(): nodemailer.Transporter | null {
    if (systemStateManager.isMockMode('email')) {
      return this.mockTransporter;
    }
    return this.transporter || this.mockTransporter;
  }

  /**
   * Reload email configuration from database
   */
  async reload(): Promise<void> {
    logger.info('Reloading email channel configuration...');
    
    // Close existing transporters
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
    if (this.mockTransporter) {
      this.mockTransporter.close();
      this.mockTransporter = null;
    }
    
    // Reinitialize
    await this.initializeMockTransporter();
    await this.initializeRealTransporter();
  }

  async close(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
    }
    if (this.mockTransporter) {
      this.mockTransporter.close();
    }
    logger.info('Email channel closed');
  }
}
