import db from '../db';
import logger from '../utils/logger';
import metrics from '../utils/metrics';

/**
 * Alarm Lifecycle Management Service
 * 
 * Handles alarm cancellation, resolution, and status workflows
 */
class AlarmLifecycleService {
  /**
   * Cancel an alarm (prevent further processing)
   */
  async cancelAlarm(alarmId: number | string, reason?: string): Promise<boolean> {
    try {
      const query = `
        UPDATE alarms
        SET 
          is_valid = 0,
          state = COALESCE(state, '{}'::jsonb) || jsonb_build_object(
            'cancelled', true,
            'cancelled_at', NOW(),
            'cancellation_reason', $2
          )
        WHERE id = $1
          AND is_valid = 1
        RETURNING id
      `;
      
      const result = await db.query(query, [alarmId, reason || 'Manual cancellation']);
      
      if (result.rows.length > 0) {
        logger.info(`Alarm ${alarmId} cancelled`, { reason });
        metrics.incrementCounter('alarm_cancelled');
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error cancelling alarm ${alarmId}:`, error);
      return false;
    }
  }

  /**
   * Resolve an alarm (mark as handled)
   */
  async resolveAlarm(alarmId: number | string, resolutionNote?: string): Promise<boolean> {
    try {
      const query = `
        UPDATE alarms
        SET 
          state = COALESCE(state, '{}'::jsonb) || jsonb_build_object(
            'resolved', true,
            'resolved_at', NOW(),
            'resolution_note', $2
          )
        WHERE id = $1
        RETURNING id
      `;
      
      const result = await db.query(query, [alarmId, resolutionNote || 'Alarm resolved']);
      
      if (result.rows.length > 0) {
        logger.info(`Alarm ${alarmId} resolved`, { resolutionNote });
        metrics.incrementCounter('alarm_resolved');
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error resolving alarm ${alarmId}:`, error);
      return false;
    }
  }

  /**
   * Cancel all pending notifications for an alarm
   */
  async cancelPendingNotifications(alarmId: number | string): Promise<boolean> {
    try {
      const query = `
        UPDATE alarms
        SET 
          sms_sent = TRUE,
          email_sent = TRUE,
          call_sent = TRUE,
          state = COALESCE(state, '{}'::jsonb) || jsonb_build_object(
            'notifications_cancelled', true,
            'cancelled_at', NOW()
          )
        WHERE id = $1
          AND (sms_sent = FALSE OR email_sent = FALSE OR call_sent = FALSE)
        RETURNING id
      `;
      
      const result = await db.query(query, [alarmId]);
      
      if (result.rows.length > 0) {
        logger.info(`Cancelled pending notifications for alarm ${alarmId}`);
        metrics.incrementCounter('alarm_notifications_cancelled');
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error cancelling notifications for alarm ${alarmId}:`, error);
      return false;
    }
  }

  /**
   * Get alarm status
   */
  async getAlarmStatus(alarmId: number | string): Promise<{
    id: number;
    status: string;
    cancelled: boolean;
    resolved: boolean;
    notificationsPending: boolean;
    state: Record<string, any>;
  } | null> {
    try {
      const query = `
        SELECT 
          id,
          status,
          is_valid,
          sms_sent,
          email_sent,
          call_sent,
          state
        FROM alarms
        WHERE id = $1
      `;
      
      const result = await db.query(query, [alarmId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      const state = row.state || {};
      
      return {
        id: row.id,
        status: row.status,
        cancelled: !row.is_valid || state.cancelled === true,
        resolved: state.resolved === true,
        notificationsPending: !row.sms_sent || !row.email_sent || !row.call_sent,
        state,
      };
    } catch (error) {
      logger.error(`Error getting alarm status for ${alarmId}:`, error);
      return null;
    }
  }

  /**
   * Batch cancel alarms by criteria
   */
  async batchCancel(criteria: {
    imei?: number | string;
    status?: string;
    createdBefore?: Date;
    createdAfter?: Date;
  }): Promise<number> {
    try {
      let query = 'UPDATE alarms SET is_valid = 0 WHERE is_valid = 1';
      const params: any[] = [];
      let paramIndex = 1;
      
      if (criteria.imei) {
        query += ` AND imei = $${paramIndex}`;
        params.push(criteria.imei);
        paramIndex++;
      }
      
      if (criteria.status) {
        query += ` AND status = $${paramIndex}`;
        params.push(criteria.status);
        paramIndex++;
      }
      
      if (criteria.createdBefore) {
        query += ` AND created_at < $${paramIndex}`;
        params.push(criteria.createdBefore);
        paramIndex++;
      }
      
      if (criteria.createdAfter) {
        query += ` AND created_at > $${paramIndex}`;
        params.push(criteria.createdAfter);
        paramIndex++;
      }
      
      query += ' RETURNING id';
      
      const result = await db.query(query, params);
      const count = result.rowCount || 0;
      
      if (count > 0) {
        logger.info(`Batch cancelled ${count} alarms`, criteria);
        metrics.incrementCounter('alarm_batch_cancelled', count);
      }
      
      return count;
    } catch (error) {
      logger.error('Error batch cancelling alarms:', error);
      return 0;
    }
  }
}

export default new AlarmLifecycleService();
