import { Client } from 'pg';
import logger from '../utils/logger';
import config from '../config';
import metrics from '../utils/metrics';

/**
 * PostgreSQL LISTEN/NOTIFY Event Listener
 * 
 * Monitors alarm creation events for observability and metrics
 * Note: Alarms are processed via RabbitMQ consumer, not through this listener.
 * This service provides real-time monitoring and metrics collection.
 */

class NotificationListener {
  private client: Client | null = null;
  private connected: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    try {
      this.client = new Client(config.database);
      
      this.client.on('notification', (msg) => {
        this.handleNotification(msg);
      });

      this.client.on('error', (err) => {
        logger.error('PostgreSQL LISTEN client error:', err);
        this.reconnect();
      });

      this.client.on('end', () => {
        logger.warn('PostgreSQL LISTEN connection ended');
        this.connected = false;
        this.reconnect();
      });

      await this.client.connect();
      
      // Subscribe to alarm channel
      await this.client.query('LISTEN alarm_created');
      
      this.connected = true;
      logger.info('PostgreSQL LISTEN/NOTIFY started - monitoring alarm creation events for observability');
      logger.info('Note: Alarm processing is handled by RabbitMQ consumer, this service provides monitoring/metrics');
    } catch (error) {
      logger.error('Failed to start PostgreSQL LISTEN:', error);
      this.reconnect();
    }
  }

  private async handleNotification(msg: any): Promise<void> {
    try {
      if (msg.channel === 'alarm_created') {
        const payload = JSON.parse(msg.payload);
        
        // Record metrics for monitoring
        metrics.incrementCounter('listen_notify_alarm_received');
        
        // Track alarm creation events for observability
        logger.debug('Alarm creation event received via LISTEN/NOTIFY', {
          alarm_id: payload.alarm_id,
          imei: payload.imei,
          status: payload.status,
          timestamp: new Date().toISOString()
        });
        
        // Note: Actual alarm processing happens via RabbitMQ consumer
        // This listener provides real-time monitoring and metrics collection
        // It helps track the time between alarm creation and processing
        if (payload.created_at) {
          const creationTime = new Date(payload.created_at).getTime();
          const notificationTime = Date.now();
          const delay = notificationTime - creationTime;
          
          metrics.recordHistogram('listen_notify_delay_ms', delay);
          
          if (delay > 1000) {
            logger.warn('Significant delay detected between alarm creation and notification', {
              alarm_id: payload.alarm_id,
              delay_ms: delay
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error handling notification:', error);
      metrics.incrementCounter('listen_notify_error');
    }
  }

  private reconnect(): void {
    if (this.reconnectTimeout) {
      return; // Already reconnecting
    }

    this.connected = false;
    
    if (this.client) {
      this.client.removeAllListeners();
      this.client.end().catch(() => {});
      this.client = null;
    }

    this.reconnectTimeout = setTimeout(() => {
      logger.info('Reconnecting to PostgreSQL LISTEN...');
      this.reconnectTimeout = null;
      this.start().catch(error => {
        logger.error('Reconnection failed:', error);
      });
    }, 5000);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async stop(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.client) {
      try {
        await this.client.query('UNLISTEN alarm_created');
        await this.client.end();
      } catch (error) {
        logger.error('Error stopping LISTEN client:', error);
      }
      this.client = null;
    }

    this.connected = false;
    logger.info('PostgreSQL LISTEN/NOTIFY stopped');
  }
}

export default new NotificationListener();
