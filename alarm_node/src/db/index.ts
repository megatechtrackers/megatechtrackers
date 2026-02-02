import { Pool, QueryResult } from 'pg';
import config from '../config';
import logger from '../utils/logger';
import metrics from '../utils/metrics';
import * as os from 'os';
import { Alarm, Contact } from '../types';

interface DedupResult {
  id: number;
  occurrence_count: number;
  notification_sent: boolean;
}

interface AlarmStats {
  pending_sms: string;
  pending_email: string;
}

class Database {
  private pool: Pool;
  private poolMonitoringInterval: NodeJS.Timeout | null = null;
  private readonly MIN_POOL_SIZE: number;
  private readonly MAX_POOL_SIZE: number;
  private readonly TARGET_POOL_SIZE: number;
  private readonly POOL_MONITOR_INTERVAL: number;
  private consecutiveFailures: number = 0;
  private isRecreatingPool: boolean = false;
  private lastPoolRecreation: number = 0;
  private readonly POOL_RECREATION_COOLDOWN: number = 10000; // 10 seconds
  private readonly FAILURE_THRESHOLD: number = 5;

  constructor() {
    this.MIN_POOL_SIZE = config.dbPool.min;
    this.MAX_POOL_SIZE = config.dbPool.max;
    this.TARGET_POOL_SIZE = config.dbPool.target;
    this.POOL_MONITOR_INTERVAL = config.dbPool.monitorInterval;
    
    this.pool = this.createPool();
    
    // Start pool monitoring
    this.startPoolMonitoring();
  }
  
  private createPool(): Pool {
    const poolConfig = {
      ...config.database,
      min: this.MIN_POOL_SIZE,
      max: this.MAX_POOL_SIZE,
      idleTimeoutMillis: config.database.idleTimeoutMillis,
      connectionTimeoutMillis: config.database.connectionTimeoutMillis,
    };
    
    const pool = new Pool(poolConfig);
    pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
      metrics.incrementCounter('db_pool_error');
      this.handlePoolError();
    });
    
    pool.on('connect', (client) => {
      metrics.incrementCounter('db_pool_connect');
      this.consecutiveFailures = 0; // Reset on successful connect
      client.query("SET timezone = 'UTC'").catch((err) => {
        logger.warn('Failed to set session timezone to UTC', { error: err });
      });
    });
    
    pool.on('remove', () => {
      metrics.incrementCounter('db_pool_remove');
    });
    
    return pool;
  }
  
  private handlePoolError(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      this.recreatePool();
    }
  }
  
  private async recreatePool(): Promise<void> {
    const now = Date.now();
    
    // Prevent concurrent recreation and enforce cooldown
    if (this.isRecreatingPool || (now - this.lastPoolRecreation) < this.POOL_RECREATION_COOLDOWN) {
      return;
    }
    
    this.isRecreatingPool = true;
    this.lastPoolRecreation = now;
    
    logger.warn('Recreating database pool due to consecutive failures...');
    metrics.incrementCounter('db_pool_recreation');
    
    try {
      // End old pool gracefully
      const oldPool = this.pool;
      try {
        await oldPool.end();
      } catch (err) {
        logger.debug('Error ending old pool:', err);
      }
      
      // Create new pool
      this.pool = this.createPool();
      
      // Test new pool
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      this.consecutiveFailures = 0;
      logger.info('Database pool recreated successfully');
      metrics.setGauge('db_pool_healthy', 1);
    } catch (err) {
      logger.error('Failed to recreate database pool:', err);
      metrics.setGauge('db_pool_healthy', 0);
      // Will retry on next failure
    } finally {
      this.isRecreatingPool = false;
    }
  }
  
  private startPoolMonitoring(): void {
    this.poolMonitoringInterval = setInterval(() => {
      this.monitorPoolHealth();
    }, this.POOL_MONITOR_INTERVAL);
  }
  
  private async monitorPoolHealth(): Promise<void> {
    try {
      const totalCount = this.pool.totalCount;
      const idleCount = this.pool.idleCount;
      const waitingCount = this.pool.waitingCount;
      
      // Update metrics
      metrics.setGauge('db_pool_total', totalCount);
      metrics.setGauge('db_pool_idle', idleCount);
      metrics.setGauge('db_pool_waiting', waitingCount);
      
      // Health check: test a connection with timeout
      const healthCheckPromise = (async () => {
        const client = await this.pool.connect();
        try {
          await client.query('SELECT 1');
          return true;
        } finally {
          client.release();
        }
      })();
      
      // Timeout for health check (5 seconds)
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), 5000);
      });
      
      await Promise.race([healthCheckPromise, timeoutPromise]);
      
      metrics.setGauge('db_pool_healthy', 1);
      this.consecutiveFailures = 0; // Reset on successful health check
      
      // Auto-tune: adjust pool if needed (basic implementation)
      if (waitingCount > 0 && totalCount < this.MAX_POOL_SIZE) {
        logger.debug(`Pool has ${waitingCount} waiting connections, consider increasing pool size`);
      }
      
      if (idleCount > this.TARGET_POOL_SIZE * 1.5 && totalCount > this.MIN_POOL_SIZE) {
        logger.debug(`Pool has ${idleCount} idle connections, consider reducing pool size`);
      }
    } catch (error) {
      logger.error('Error monitoring pool health:', error);
      metrics.setGauge('db_pool_healthy', 0);
      this.handlePoolError(); // Trigger pool recovery if needed
    }
  }

  async connect(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      logger.info('Database connection established');
      client.release();
      return true;
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  }

  async query(text: string, params?: any[]): Promise<QueryResult<any>> {
    const start = Date.now();
    const maxRetries = 3;
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await this.pool.query(text, params);
        const duration = Date.now() - start;
        logger.debug('Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
        return res;
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a connection error that should be retried
        const isConnectionError = 
          error.code === 'ECONNREFUSED' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ENOTFOUND' ||
          error.code === '57P01' || // PostgreSQL: terminating connection due to administrator command
          error.code === '57P02' || // PostgreSQL: terminating connection due to crash
          error.code === '57P03' || // PostgreSQL: terminating connection due to connection failure
          error.message?.includes('Connection terminated') ||
          error.message?.includes('Connection lost');
        
        if (isConnectionError && attempt < maxRetries) {
          const delay = Math.min(1000 * attempt, 5000); // 1s, 2s, 5s max
          logger.warn(`Database connection error (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`, {
            error: error.message,
            code: error.code
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Not a connection error or max retries reached
        logger.error('Query error:', { text: text.substring(0, 100), error: error.message, attempt });
        throw error;
      }
    }
    
    // Should never reach here, but TypeScript needs it
    throw lastError;
  }


  async wasNotificationSent(alarmId: number | string, notificationType: string): Promise<boolean> {
    const query = `
      SELECT id FROM alarms_history
      WHERE alarm_id = $1 AND notification_type = $2 AND status = 'success'
      LIMIT 1
    `;
    
    try {
      const result = await this.query(query, [alarmId, notificationType]);
      return result.rows.length > 0;
    } catch (error: any) {
      logger.warn('Error checking notification history:', error.message);
      return false;
    }
  }

  async recordNotificationAttempt(
    alarmId: number | string,
    imei: number | string,
    gpsTime: Date,
    notificationType: string,
    recipient: string,
    status: string,
    errorMessage: string | null = null,
    responseData: any = null,
    providerMessageId: string | null = null,
    providerName: string | null = null,
    modemId: number | null = null,
    modemName: string | null = null
  ): Promise<number | void> {
    // Record notification attempt - simple insert without ON CONFLICT
    // Duplicates are acceptable as they provide audit trail
    const attemptNumber = await this.getAttemptCount(alarmId, notificationType) + 1;
    
    const query = `
      INSERT INTO alarms_history (
        alarm_id, imei, alarm_gps_time, notification_type, recipient, 
        status, attempt_number, sent_at, error_message, response_data,
        provider_message_id, provider_name, delivery_status, modem_id, modem_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `;
    
    try {
      const params = [
        alarmId, imei, gpsTime, notificationType, recipient, status, attemptNumber,
        errorMessage, responseData ? JSON.stringify(responseData) : null,
        providerMessageId, providerName, status === 'success' ? 'sent' : 'failed',
        modemId, modemName
      ];
      
      const result = await this.query(query, params);
      
      logger.debug(`Recorded ${notificationType} attempt for alarm ${alarmId}`, { 
        status, attemptNumber, historyId: result.rows[0]?.id, providerMessageId,
        modemId, modemName
      });
      
      return result.rows[0]?.id;
    } catch (error: any) {
      // Don't throw for recording failures - the notification was already sent
      // This is just for audit trail, not critical path
      logger.warn(`Error recording notification attempt for alarm ${alarmId}:`, error.message);
      return;
    }
  }

  async getAttemptCount(alarmId: number | string, notificationType: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM alarms_history
      WHERE alarm_id = $1 AND notification_type = $2
    `;
    
    try {
      const result = await this.query(query, [alarmId, notificationType]);
      return parseInt(result.rows[0].count);
    } catch (error: any) {
      logger.warn('Error getting attempt count:', error.message);
      return 0;
    }
  }

  async markSmsSent(id: number | string): Promise<void> {
    const query = `
      UPDATE alarms
      SET sms_sent = TRUE, sms_sent_at = NOW()
      WHERE id = $1
    `;
    
    try {
      await this.query(query, [id]);
      logger.info(`Marked SMS as sent for alarm ID: ${id}`);
    } catch (error) {
      logger.error('Error marking SMS as sent:', error);
      throw error;
    }
  }

  async markEmailSent(id: number | string): Promise<void> {
    const query = `
      UPDATE alarms
      SET email_sent = TRUE, email_sent_at = NOW()
      WHERE id = $1
    `;
    
    try {
      await this.query(query, [id]);
      logger.info(`Marked email as sent for alarm ID: ${id}`);
    } catch (error) {
      logger.error('Error marking email as sent:', error);
      throw error;
    }
  }

  async markCallSent(id: number | string): Promise<void> {
    const query = `
      UPDATE alarms
      SET call_sent = TRUE, call_sent_at = NOW()
      WHERE id = $1
    `;
    
    try {
      await this.query(query, [id]);
      logger.info(`Marked call as sent for alarm ID: ${id}`);
    } catch (error) {
      logger.error('Error marking call as sent:', error);
      throw error;
    }
  }

  async getDeviceContacts(imei: number | string): Promise<Contact[]> {
    const query = `
      SELECT email, phone, contact_name, priority
      FROM alarms_contacts
      WHERE imei = $1 AND active = TRUE
      ORDER BY priority ASC
    `;
    
    try {
      const result = await this.query(query, [imei]);
      return result.rows as Contact[];
    } catch (error: any) {
      logger.warn(`Could not fetch contacts for IMEI ${imei}:`, error.message);
      return [];
    }
  }

  async getAlarmStats(): Promise<AlarmStats> {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE is_sms = 1 AND sms_sent = FALSE) as pending_sms,
        COUNT(*) FILTER (WHERE is_email = 1 AND email_sent = FALSE) as pending_email
      FROM alarms
      WHERE is_valid = 1
    `;
    
    try {
      const result = await this.query(query);
      return result.rows[0] as AlarmStats;
    } catch (error) {
      logger.error('Error getting alarm stats:', error);
      return { pending_sms: '0', pending_email: '0' };
    }
  }

  async addToDLQ(alarm: Alarm, channel: string, errorMessage: string, errorType: string, attempts: number): Promise<number | void> {
    const query = `
      INSERT INTO alarms_dlq (
        alarm_id, imei, channel, payload, error_message, error_type, 
        attempts, last_attempt_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `;
    
    try {
      const result = await this.query(query, [
        alarm.id, alarm.imei, channel, JSON.stringify(alarm),
        errorMessage, errorType, attempts
      ]);
      
      logger.warn(`Added alarm ${alarm.id} to DLQ`, {
        dlq_id: result.rows[0].id, channel, error_type: errorType, attempts
      });
      
      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to add to DLQ:', error);
    }
  }

  async getDLQItems(channel: string | null = null, limit: number = 100): Promise<any[]> {
    const query = channel
      ? `SELECT * FROM alarms_dlq WHERE reprocessed = FALSE AND channel = $1 ORDER BY created_at DESC LIMIT $2`
      : `SELECT * FROM alarms_dlq WHERE reprocessed = FALSE ORDER BY created_at DESC LIMIT $1`;
    
    const params = channel ? [channel, limit] : [limit];
    const result = await this.query(query, params);
    return result.rows;
  }

  async markDLQReprocessed(dlqId: number): Promise<void> {
    const query = `
      UPDATE alarms_dlq
      SET reprocessed = TRUE, reprocessed_at = NOW(), reprocessed_by = $1
      WHERE id = $2
    `;
    
    const workerId = `${os.hostname()}-${process.pid}`;
    await this.query(query, [workerId, dlqId]);
  }

  async checkDeduplication(imei: number | string, alarmType: string, windowMinutes: number = 5): Promise<DedupResult | null> {
    const query = `
      SELECT id, occurrence_count, notification_sent
      FROM alarms_dedup
      WHERE imei = $1 AND alarm_type = $2 
        AND last_occurrence > NOW() - INTERVAL '${windowMinutes} minutes'
      ORDER BY last_occurrence DESC
      LIMIT 1
    `;
    
    try {
      const result = await this.query(query, [imei, alarmType]);
      return result.rows[0] as DedupResult || null;
    } catch (error) {
      logger.error('Error checking deduplication:', error);
      return null;
    }
  }

  async updateDeduplication(imei: number | string, alarmType: string): Promise<{ id: number; occurrence_count: number } | void> {
    // Use UPSERT with time window check in the UPDATE logic
    // If record is older than 5 minutes, reset it; otherwise increment count
    const query = `
      INSERT INTO alarms_dedup (imei, alarm_type, first_occurrence, last_occurrence, occurrence_count)
      VALUES ($1, $2, NOW(), NOW(), 1)
      ON CONFLICT (imei, alarm_type) 
      DO UPDATE SET 
        first_occurrence = CASE 
          WHEN alarms_dedup.last_occurrence < NOW() - INTERVAL '5 minutes' THEN NOW()
          ELSE alarms_dedup.first_occurrence 
        END,
        last_occurrence = NOW(),
        occurrence_count = CASE 
          WHEN alarms_dedup.last_occurrence < NOW() - INTERVAL '5 minutes' THEN 1
          ELSE alarms_dedup.occurrence_count + 1 
        END
      RETURNING id, occurrence_count
    `;
    
    try {
      const result = await this.query(query, [imei, alarmType]);
      return result.rows[0];
    } catch (error) {
      logger.warn('Error updating deduplication:', error);
      return;
    }
  }

  async isInQuietHours(imei: number | string): Promise<boolean> {
    const query = `
      SELECT quiet_hours_start, quiet_hours_end
      FROM alarms_contacts
      WHERE imei = $1 AND active = TRUE
        AND quiet_hours_start IS NOT NULL
        AND quiet_hours_end IS NOT NULL
      LIMIT 1
    `;
    
    try {
      const result = await this.query(query, [imei]);
      if (result.rows.length === 0) {
        return false;
      }
      
      const contact = result.rows[0];
      const quietStart = contact.quiet_hours_start;
      const quietEnd = contact.quiet_hours_end;
      
      const now = new Date();
      const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
      
      if (quietStart <= quietEnd) {
        return currentTime >= quietStart && currentTime <= quietEnd;
      } else {
        return currentTime >= quietStart || currentTime <= quietEnd;
      }
    } catch (error) {
      logger.error('Error checking quiet hours:', error);
      return false;
    }
  }

  async getPendingAlarms(channel?: 'email' | 'sms' | 'voice' | 'all', limit: number = 100): Promise<any[]> {
    let query: string;
    let params: any[];

    if (channel === 'sms') {
      query = `
        SELECT * FROM alarms
        WHERE is_sms = 1 AND sms_sent = FALSE AND is_valid = 1
        ORDER BY id DESC
        LIMIT $1
      `;
      params = [limit];
    } else if (channel === 'email') {
      query = `
        SELECT * FROM alarms
        WHERE is_email = 1 AND email_sent = FALSE AND is_valid = 1
        ORDER BY id DESC
        LIMIT $1
      `;
      params = [limit];
    } else if (channel === 'voice') {
      query = `
        SELECT * FROM alarms
        WHERE is_call = 1 AND call_sent = FALSE AND is_valid = 1
        ORDER BY id DESC
        LIMIT $1
      `;
      params = [limit];
    } else {
      // 'all' or undefined - get alarms with any pending notification
      query = `
        SELECT * FROM alarms
        WHERE is_valid = 1
          AND (
            (is_sms = 1 AND sms_sent = FALSE) OR
            (is_email = 1 AND email_sent = FALSE) OR
            (is_call = 1 AND call_sent = FALSE)
          )
        ORDER BY id DESC
        LIMIT $1
      `;
      params = [limit];
    }

    try {
      const result = await this.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting pending alarms:', error);
      return [];
    }
  }

  async close(): Promise<void> {
    if (this.poolMonitoringInterval) {
      clearInterval(this.poolMonitoringInterval);
      this.poolMonitoringInterval = null;
    }
    await this.pool.end();
    logger.info('Database connection pool closed');
  }
}

export default new Database();
