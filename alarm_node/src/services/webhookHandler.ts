import express, { Request, Response, Router } from 'express';
import logger from '../utils/logger';
import db from '../db';
import metrics from '../utils/metrics';
import config from '../config';
import { withRetry } from '../utils/retry';
import crypto from 'crypto';

/**
 * Webhook Handler for Email Bounces and SMS Delivery Receipts
 * 
 * Endpoints:
 * - POST /webhooks/email/bounce - Email bounce notifications
 * - POST /webhooks/email/delivery - Email delivery confirmations
 * - POST /webhooks/sms/delivery - SMS delivery receipts
 */

interface EmailBounceWebhook {
  messageId: string;
  recipient: string;
  bounceType: 'hard' | 'soft' | 'complaint';
  reason: string;
  timestamp: string;
}

interface SmsDeliveryWebhook {
  messageId: string;
  recipient: string;
  status: 'delivered' | 'failed' | 'undelivered';
  errorCode?: string;
  timestamp: string;
}

class WebhookHandler {
  private router: Router;
  private webhookSecret: string;
  private rateLimitMap: Map<string, { count: number; resetAt: number }> = new Map();
  private readonly RATE_LIMIT_WINDOW: number;
  private readonly RATE_LIMIT_MAX: number;
  private readonly WEBHOOK_RETRY_ATTEMPTS: number;
  private readonly WEBHOOK_RETRY_DELAY: number;

  constructor() {
    this.router = express.Router();
    this.webhookSecret = config.webhook.secret;
    this.RATE_LIMIT_WINDOW = config.webhook.rateLimitWindow;
    this.RATE_LIMIT_MAX = config.webhook.rateLimitMax;
    this.WEBHOOK_RETRY_ATTEMPTS = config.webhook.retryAttempts;
    this.WEBHOOK_RETRY_DELAY = config.webhook.retryDelay;
    this.setupRoutes();
    this.startRateLimitCleanup();
  }
  
  private startRateLimitCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [ip, data] of this.rateLimitMap.entries()) {
        if (now > data.resetAt) {
          this.rateLimitMap.delete(ip);
        }
      }
    }, 60000); // Cleanup every minute
  }
  
  private checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const limit = this.rateLimitMap.get(ip);
    
    if (!limit || now > limit.resetAt) {
      this.rateLimitMap.set(ip, { count: 1, resetAt: now + this.RATE_LIMIT_WINDOW });
      return true;
    }
    
    if (limit.count >= this.RATE_LIMIT_MAX) {
      metrics.incrementCounter('webhook_rate_limit_exceeded');
      return false;
    }
    
    limit.count++;
    return true;
  }
  
  private verifySignature(body: string, signature: string, secret: string): boolean {
    if (!secret) {
      return true; // Skip verification if no secret configured
    }
    
    const hmac = crypto.createHmac('sha256', secret);
    const hash = hmac.update(body).digest('hex');
    const expectedSignature = `sha256=${hash}`;
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
  
  private getClientIp(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
           (req.headers['x-real-ip'] as string) || 
           req.ip || 
           'unknown';
  }

  private setupRoutes(): void {
    // Email bounce webhook
    this.router.post('/email/bounce', this.handleEmailBounce.bind(this));
    
    // Email delivery webhook
    this.router.post('/email/delivery', this.handleEmailDelivery.bind(this));
    
    // SMS delivery receipt webhook
    this.router.post('/sms/delivery', this.handleSmsDelivery.bind(this));
  }

  private async handleEmailBounce(req: Request, res: Response): Promise<void> {
    const clientIp = this.getClientIp(req);
    
    // Rate limiting
    if (!this.checkRateLimit(clientIp)) {
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }
    
    // Signature verification
    const signature = req.headers['x-webhook-signature'] as string;
    if (this.webhookSecret && signature) {
      const bodyString = JSON.stringify(req.body);
      if (!this.verifySignature(bodyString, signature, this.webhookSecret)) {
        logger.warn('Invalid webhook signature', { ip: clientIp });
        metrics.incrementCounter('webhook_signature_invalid');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }
    
    try {
      const bounce: EmailBounceWebhook = req.body;
      
      logger.info('Email bounce received', {
        messageId: bounce.messageId,
        recipient: bounce.recipient,
        bounceType: bounce.bounceType
      });

      // Update alarms_history with retry logic
      await withRetry(
        async () => {
          await this.updateDeliveryStatus(
            bounce.messageId,
            'email',
            bounce.bounceType === 'hard' ? 'bounced_hard' : 'bounced_soft',
            bounce.reason
          );
        },
        {
          maxRetries: this.WEBHOOK_RETRY_ATTEMPTS,
          baseDelay: this.WEBHOOK_RETRY_DELAY,
          shouldRetry: (error: any) => {
            // Retry on database errors
            return error.code && error.code.startsWith('2');
          }
        }
      );

      // Update contact bounce count if hard bounce
      if (bounce.bounceType === 'hard') {
        await withRetry(
          async () => {
            await this.incrementBounceCount(bounce.recipient);
            await this.disableContactAfterBounces(bounce.recipient, 3);
          },
          {
            maxRetries: this.WEBHOOK_RETRY_ATTEMPTS,
            baseDelay: this.WEBHOOK_RETRY_DELAY
          }
        );
      }

      metrics.incrementCounter('email_bounce_total');
      if (bounce.bounceType === 'hard') {
        metrics.incrementCounter('email_bounce_hard_total');
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error('Error handling email bounce webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async handleEmailDelivery(req: Request, res: Response): Promise<void> {
    const clientIp = this.getClientIp(req);
    
    // Rate limiting
    if (!this.checkRateLimit(clientIp)) {
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }
    
    // Signature verification
    const signature = req.headers['x-webhook-signature'] as string;
    if (this.webhookSecret && signature) {
      const bodyString = JSON.stringify(req.body);
      if (!this.verifySignature(bodyString, signature, this.webhookSecret)) {
        logger.warn('Invalid webhook signature', { ip: clientIp });
        metrics.incrementCounter('webhook_signature_invalid');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }
    
    try {
      const delivery = req.body;
      
      logger.info('Email delivery confirmed', {
        messageId: delivery.messageId,
        recipient: delivery.recipient
      });

      await withRetry(
        async () => {
          await this.updateDeliveryStatus(
            delivery.messageId,
            'email',
            'delivered',
            null
          );
        },
        {
          maxRetries: this.WEBHOOK_RETRY_ATTEMPTS,
          baseDelay: this.WEBHOOK_RETRY_DELAY
        }
      );

      metrics.incrementCounter('email_delivery_confirmed_total');

      res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error('Error handling email delivery webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async handleSmsDelivery(req: Request, res: Response): Promise<void> {
    const clientIp = this.getClientIp(req);
    
    // Rate limiting
    if (!this.checkRateLimit(clientIp)) {
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }
    
    // Signature verification
    const signature = req.headers['x-webhook-signature'] as string;
    if (this.webhookSecret && signature) {
      const bodyString = JSON.stringify(req.body);
      if (!this.verifySignature(bodyString, signature, this.webhookSecret)) {
        logger.warn('Invalid webhook signature', { ip: clientIp });
        metrics.incrementCounter('webhook_signature_invalid');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }
    
    try {
      const delivery: SmsDeliveryWebhook = req.body;
      
      logger.info('SMS delivery receipt received', {
        messageId: delivery.messageId,
        recipient: delivery.recipient,
        status: delivery.status
      });

      await withRetry(
        async () => {
          await this.updateDeliveryStatus(
            delivery.messageId,
            'sms',
            delivery.status,
            delivery.errorCode || null
          );
        },
        {
          maxRetries: this.WEBHOOK_RETRY_ATTEMPTS,
          baseDelay: this.WEBHOOK_RETRY_DELAY
        }
      );

      metrics.incrementCounter('sms_delivery_receipt_total');
      if (delivery.status === 'delivered') {
        metrics.incrementCounter('sms_delivery_confirmed_total');
      } else if (delivery.status === 'failed') {
        metrics.incrementCounter('sms_delivery_failed_total');
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error('Error handling SMS delivery webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async updateDeliveryStatus(
    providerMessageId: string,
    channel: string,
    status: string,
    errorMessage: string | null
  ): Promise<void> {
    const query = `
      UPDATE alarms_history
      SET delivery_status = $1, delivery_confirmed_at = NOW(), delivery_error = $2
      WHERE provider_message_id = $3 AND notification_type = $4
      RETURNING alarm_id
    `;
    
    try {
      const result = await db.query(query, [status, errorMessage, providerMessageId, channel]);
      
      if (result.rows.length > 0) {
        logger.debug(`Updated delivery status for message ${providerMessageId}`, {
          alarm_id: result.rows[0].alarm_id,
          status
        });
      } else {
        logger.warn(`No alarms_history found for provider message ID: ${providerMessageId}`);
      }
    } catch (error) {
      logger.error('Error updating delivery status:', error);
      throw error;
    }
  }

  private async incrementBounceCount(email: string): Promise<void> {
    const query = `
      UPDATE alarms_contacts
      SET bounce_count = COALESCE(bounce_count, 0) + 1,
          last_bounce_at = NOW()
      WHERE email = $1
    `;
    
    await db.query(query, [email]);
  }

  private async disableContactAfterBounces(email: string, threshold: number): Promise<void> {
    const query = `
      UPDATE alarms_contacts
      SET active = FALSE
      WHERE email = $1 AND bounce_count >= $2
      RETURNING imei, email
    `;
    
    const result = await db.query(query, [email, threshold]);
    
    if (result.rows.length > 0) {
      logger.warn(`Disabled contact after ${threshold} bounces`, {
        imei: result.rows[0].imei,
        email: result.rows[0].email
      });
    }
  }

  getRouter(): Router {
    return this.router;
  }
}

export default new WebhookHandler();
