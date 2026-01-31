import db from '../db';
import logger from '../utils/logger';
import metrics from '../utils/metrics';

/**
 * Bounce Handler Service
 * 
 * Handles email bounce detection, classification, and recipient management
 * Supports hard/soft bounce classification and automatic recipient disabling
 */
interface BounceInfo {
  recipient: string;
  bounceType: 'hard' | 'soft' | 'complaint' | 'unknown';
  reason: string;
  timestamp: Date;
  messageId?: string;
}

class BounceHandler {
  private readonly HARD_BOUNCE_THRESHOLD = 1; // Disable after 1 hard bounce
  private readonly SOFT_BOUNCE_THRESHOLD = 3; // Disable after 3 soft bounces
  private readonly BOUNCE_RESET_DAYS = 30; // Reset bounce count after 30 days

  /**
   * Process bounce notification
   */
  async processBounce(bounceInfo: BounceInfo): Promise<void> {
    try {
      const bounceType = this.classifyBounce(bounceInfo);
      
      logger.info('Processing bounce', {
        recipient: bounceInfo.recipient,
        bounceType,
        reason: bounceInfo.reason
      });

      // Update bounce count in alarms_contacts
      await this.updateBounceCount(bounceInfo.recipient, bounceType);
      
      // Record in alarms_history
      await this.recordBounce(bounceInfo, bounceType);
      
      // Check if recipient should be disabled
      const shouldDisable = await this.shouldDisableRecipient(bounceInfo.recipient, bounceType);
      
      if (shouldDisable) {
        await this.disableRecipient(bounceInfo.recipient, bounceType);
        metrics.incrementCounter('email_recipient_disabled');
      }
      
      metrics.incrementCounter('email_bounce_processed');
    } catch (error) {
      logger.error('Error processing bounce:', error);
      metrics.incrementCounter('bounce_processing_error');
    }
  }

  /**
   * Classify bounce type based on reason
   */
  private classifyBounce(bounceInfo: BounceInfo): 'hard' | 'soft' | 'complaint' {
    const reason = bounceInfo.reason.toLowerCase();
    
    // Hard bounce patterns
    const hardBouncePatterns = [
      'user unknown',
      'mailbox not found',
      'address not found',
      'invalid recipient',
      'recipient rejected',
      'no such user',
      'mailbox unavailable',
      '550',
      '551',
      '553',
      'permanent failure',
      'does not exist',
    ];
    
    // Soft bounce patterns
    const softBouncePatterns = [
      'mailbox full',
      'quota exceeded',
      'temporarily unavailable',
      'try again later',
      'over quota',
      'temporary failure',
      '421',
      '450',
      '451',
      '452',
    ];
    
    // Complaint patterns
    const complaintPatterns = [
      'spam',
      'abuse',
      'complaint',
      'unsubscribe',
      'opt-out',
    ];
    
    // Check for hard bounce
    if (hardBouncePatterns.some(pattern => reason.includes(pattern))) {
      return 'hard';
    }
    
    // Check for complaint
    if (complaintPatterns.some(pattern => reason.includes(pattern))) {
      return 'complaint';
    }
    
    // Check for soft bounce
    if (softBouncePatterns.some(pattern => reason.includes(pattern))) {
      return 'soft';
    }
    
    // Default to soft for unknown bounces (might be temporary)
    return 'soft';
  }

  /**
   * Update bounce count for recipient
   */
  private async updateBounceCount(recipient: string, _bounceType: 'hard' | 'soft' | 'complaint'): Promise<void> {
    try {
      const query = `
        UPDATE alarms_contacts
        SET 
          bounce_count = bounce_count + 1,
          last_bounce_at = NOW(),
          active = CASE
            WHEN bounce_type = 'hard' AND bounce_count >= $2 THEN FALSE
            WHEN bounce_type = 'soft' AND bounce_count >= $3 THEN FALSE
            ELSE active
          END
        WHERE email = $1
        RETURNING id, bounce_count, active
      `;
      
      const result = await db.query(query, [
        recipient,
        this.HARD_BOUNCE_THRESHOLD,
        this.SOFT_BOUNCE_THRESHOLD
      ]);
      
      if (result.rows.length > 0) {
        logger.debug('Updated bounce count', {
          recipient,
          bounceCount: result.rows[0].bounce_count,
          active: result.rows[0].active
        });
      }
    } catch (error) {
      logger.error('Error updating bounce count:', error);
    }
  }

  /**
   * Record bounce in alarms_history
   */
  private async recordBounce(
    bounceInfo: BounceInfo,
    bounceType: 'hard' | 'soft' | 'complaint'
  ): Promise<void> {
    try {
      const query = `
        UPDATE alarms_history
        SET 
          delivery_status = 'bounced',
          bounce_type = $1,
          bounce_reason = $2,
          delivered_at = NULL
        WHERE recipient = $3
          AND provider_message_id = $4
          AND delivery_status = 'sent'
        RETURNING id
      `;
      
      if (bounceInfo.messageId) {
        await db.query(query, [
          bounceType,
          bounceInfo.reason,
          bounceInfo.recipient,
          bounceInfo.messageId
        ]);
      }
    } catch (error) {
      logger.error('Error recording bounce:', error);
    }
  }

  /**
   * Check if recipient should be disabled
   */
  private async shouldDisableRecipient(
    recipient: string,
    bounceType: 'hard' | 'soft' | 'complaint'
  ): Promise<boolean> {
    try {
      const query = `
        SELECT bounce_count, last_bounce_at
        FROM alarms_contacts
        WHERE email = $1
      `;
      
      const result = await db.query(query, [recipient]);
      
      if (result.rows.length === 0) {
        return false;
      }
      
      const row = result.rows[0];
      const bounceCount = row.bounce_count || 0;
      
      // Hard bounce: disable immediately
      if (bounceType === 'hard' && bounceCount >= this.HARD_BOUNCE_THRESHOLD) {
        return true;
      }
      
      // Complaint: disable immediately
      if (bounceType === 'complaint') {
        return true;
      }
      
      // Soft bounce: disable after threshold
      if (bounceType === 'soft' && bounceCount >= this.SOFT_BOUNCE_THRESHOLD) {
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking if recipient should be disabled:', error);
      return false;
    }
  }

  /**
   * Disable recipient
   */
  private async disableRecipient(
    recipient: string,
    bounceType: 'hard' | 'soft' | 'complaint'
  ): Promise<void> {
    try {
      const query = `
        UPDATE alarms_contacts
        SET active = FALSE
        WHERE email = $1
        RETURNING id, imei
      `;
      
      const result = await db.query(query, [recipient]);
      
      if (result.rows.length > 0) {
        logger.warn('Recipient disabled due to bounces', {
          recipient,
          bounceType,
          imei: result.rows[0].imei
        });
      }
    } catch (error) {
      logger.error('Error disabling recipient:', error);
    }
  }

  /**
   * Reset bounce counts for recipients that haven't bounced in a while
   */
  async resetOldBounces(): Promise<number> {
    try {
      const query = `
        UPDATE alarms_contacts
        SET 
          bounce_count = 0,
          last_bounce_at = NULL
        WHERE last_bounce_at < NOW() - INTERVAL '${this.BOUNCE_RESET_DAYS} days'
          AND bounce_count > 0
        RETURNING id
      `;
      
      const result = await db.query(query);
      const count = result.rowCount || 0;
      
      if (count > 0) {
        logger.info(`Reset bounce counts for ${count} recipients`);
        metrics.incrementCounter('bounce_counts_reset', count);
      }
      
      return count;
    } catch (error) {
      logger.error('Error resetting old bounces:', error);
      return 0;
    }
  }

  /**
   * Get bounce statistics
   */
  async getBounceStats(): Promise<{
    totalBounces: number;
    hardBounces: number;
    softBounces: number;
    complaints: number;
    disabledRecipients: number;
  }> {
    try {
      const query = `
        SELECT 
          COUNT(*) FILTER (WHERE bounce_type = 'hard') as hard_bounces,
          COUNT(*) FILTER (WHERE bounce_type = 'soft') as soft_bounces,
          COUNT(*) FILTER (WHERE bounce_type = 'complaint') as complaints,
          COUNT(*) as total_bounces
        FROM alarms_history
        WHERE delivery_status = 'bounced'
          AND sent_at > NOW() - INTERVAL '24 hours'
      `;
      
      const bounceResult = await db.query(query);
      const bounceRow = bounceResult.rows[0];
      
      const disabledQuery = `
        SELECT COUNT(*) as disabled_count
        FROM alarms_contacts
        WHERE active = FALSE AND bounce_count > 0
      `;
      
      const disabledResult = await db.query(disabledQuery);
      const disabledRow = disabledResult.rows[0];
      
      return {
        totalBounces: parseInt(bounceRow.total_bounces) || 0,
        hardBounces: parseInt(bounceRow.hard_bounces) || 0,
        softBounces: parseInt(bounceRow.soft_bounces) || 0,
        complaints: parseInt(bounceRow.complaints) || 0,
        disabledRecipients: parseInt(disabledRow.disabled_count) || 0,
      };
    } catch (error) {
      logger.error('Error getting bounce stats:', error);
      return {
        totalBounces: 0,
        hardBounces: 0,
        softBounces: 0,
        complaints: 0,
        disabledRecipients: 0,
      };
    }
  }
}

export default new BounceHandler();
