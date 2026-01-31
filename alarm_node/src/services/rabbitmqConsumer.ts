// @ts-ignore - amqplib types may have issues
import amqp from 'amqplib';
import logger from '../utils/logger';
import metrics from '../utils/metrics';
import config from '../config';
import alarmProcessor from './alarmProcessor';
import systemStateManager from './systemState';
import { Alarm } from '../types';

/**
 * RabbitMQ Consumer for Alarm Processing
 * 
 * Consumes alarm notifications from RabbitMQ and processes them
 * Supports priority processing and automatic retry
 */
class RabbitMQConsumer {
  private connection: any = null;
  private channel: any = null;
  private exchangeName = 'alarm_exchange';
  private queueName = 'alarm_notifications';
  private isConsuming = false;
  private prefetchCount: number;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private messagesProcessed = 0;
  private lastRateUpdate = Date.now();
  private queueMonitoringInterval: NodeJS.Timeout | null = null;
  private readonly QUEUE_MONITOR_INTERVAL: number;
  private pausedMessageIds = new Set<string>(); // Track unique message IDs when paused
  private pausedMessages = new Map<string, { alarm: Alarm; pausedAt: Date }>(); // Store full alarm info
  private lastPauseLogTime = 0;
  private readonly PAUSE_LOG_INTERVAL = 30000; // Log every 30 seconds when paused

  constructor() {
    this.exchangeName = config.rabbitmq.exchange;
    this.queueName = config.rabbitmq.queue;
    this.prefetchCount = config.rabbitmq.prefetch;
    this.maxReconnectAttempts = config.rabbitmq.maxReconnectAttempts;
    this.reconnectDelay = config.rabbitmq.reconnectDelay;
    this.QUEUE_MONITOR_INTERVAL = config.rabbitmq.queueMonitoringInterval;
  }

  async connect(): Promise<void> {
    const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'; // Keep direct env access for URL

    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      // Set prefetch to control concurrency
      if (this.channel) {
        await this.channel.prefetch(this.prefetchCount);
      }

      // Handle connection errors
      if (this.connection) {
        this.connection.on('error', (err: Error) => {
        logger.error('RabbitMQ connection error:', err);
        metrics.setGauge('rabbitmq_connection_status', 0);
          metrics.incrementCounter('rabbitmq_connection_error');
          this.reconnect();
        });

        this.connection.on('close', () => {
          logger.warn('RabbitMQ connection closed');
          metrics.setGauge('rabbitmq_connection_status', 0);
          this.reconnect();
        });
      }

      // Ensure exchange and queue exist
      // Use topic exchange to support routing from Consumer Service
      if (this.channel) {
        await this.channel.assertExchange(this.exchangeName, 'topic', {
          durable: true
        });

        // Declare DLQ first (must match definitions.json: 604800000 = 7 days)
        const dlqName = 'alarm_notifications_dlq';
        await this.channel.assertQueue(dlqName, {
          durable: true,
          arguments: {
            'x-message-ttl': 604800000, // 7 days (matches definitions.json)
            'x-max-length': 10000
          }
        });

        await this.channel.assertQueue(this.queueName, {
          durable: true,
          arguments: {
            'x-max-priority': 10,
            'x-message-ttl': 86400000, // 24 hours (matches definitions.json)
            'x-max-length': 50000, // Must match definitions.json
            'x-dead-letter-exchange': 'dlx_tracking_data', // Must match definitions.json
            'x-dead-letter-routing-key': 'dlq_alarm_notifications', // Must match definitions.json
            'x-queue-mode': 'lazy' // Must match definitions.json
          }
        });

        // Bind to alarm_exchange with routing key for alarm notifications
        await this.channel.bindQueue(this.queueName, this.exchangeName, 'alarm.notification');
      }

      // Set connection status metric
      metrics.setGauge('rabbitmq_connection_status', 1);
      
      logger.info('RabbitMQ consumer connected', {
        exchange: this.exchangeName,
        queue: this.queueName,
        prefetch: this.prefetchCount
      });
      
      // Start monitoring queue metrics
      this.startQueueMonitoring();
    } catch (error: any) {
      logger.error('Failed to connect to RabbitMQ:', error);
      metrics.setGauge('rabbitmq_connection_status', 0);
      metrics.incrementCounter('rabbitmq_connection_error');
      throw error;
    }
  }
  
  private startQueueMonitoring(): void {
    // Monitor queue at configured interval
    this.queueMonitoringInterval = setInterval(async () => {
      await this.updateQueueMetrics();
    }, this.QUEUE_MONITOR_INTERVAL);
  }
  
  private async updateQueueMetrics(): Promise<void> {
    if (!this.channel) {
      metrics.setGauge('rabbitmq_connection_status', 0);
      return;
    }
    
    try {
      const queueInfo = await this.channel.checkQueue(this.queueName);
      // messageCount = ready messages, consumerCount included for context
      // When paused, messages are requeued but immediately re-consumed, so they appear as "in-flight"
      const queueDepth = queueInfo.messageCount;
      metrics.setGauge('rabbitmq_queue_depth', queueDepth);
      metrics.setGauge('rabbitmq_queue_messages_ready', queueInfo.messageCount);
      metrics.setGauge('rabbitmq_queue_consumer_count', queueInfo.consumerCount);
      
      // Set alarm_queue_size for backward compatibility (same as rabbitmq_queue_depth)
      metrics.setGauge('alarm_queue_size', queueDepth);
      
      // Apply backpressure if queue depth exceeds threshold (1000 messages)
      const BACKPRESSURE_THRESHOLD = 1000;
      if (queueDepth > BACKPRESSURE_THRESHOLD) {
        metrics.incrementCounter('alarm_backpressure_applied');
        logger.warn(`Backpressure applied: queue depth ${queueDepth} exceeds threshold ${BACKPRESSURE_THRESHOLD}`);
      }
      
      // Calculate consumer lag (simplified - time since oldest message)
      // Note: This is an approximation. For accurate lag, you'd need message timestamps
      if (queueDepth > 0) {
        // Estimate lag based on queue depth and processing rate
        // This is a simplified calculation
        const estimatedLag = queueDepth * 100; // Assume 100ms per message
        metrics.setGauge('rabbitmq_consumer_lag_ms', estimatedLag);
      } else {
        metrics.setGauge('rabbitmq_consumer_lag_ms', 0);
      }
      
      metrics.setGauge('rabbitmq_connection_status', 1);
    } catch (error) {
      logger.error('Error updating queue metrics:', error);
      metrics.setGauge('rabbitmq_connection_status', 0);
    }
  }
  
  private updateProcessingRate(): void {
    const now = Date.now();
    const elapsed = now - this.lastRateUpdate;
    
    // Update rate every second
    if (elapsed >= 1000) {
      const rate = (this.messagesProcessed / elapsed) * 1000; // messages per second
      metrics.setGauge('rabbitmq_messages_processed_rate', rate);
      this.messagesProcessed = 0;
      this.lastRateUpdate = now;
    }
  }

  private async reconnect(): Promise<void> {
    // Reset reconnection attempts after successful connection
    // This allows unlimited reconnections over time, just with rate limiting
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn(`Max reconnection attempts (${this.maxReconnectAttempts}) reached, waiting 60s before resetting...`);
      setTimeout(() => {
        this.reconnectAttempts = 0;
        logger.info('Reconnection attempts reset, retrying...');
        this.reconnect();
      }, 60000); // Wait 1 minute before resetting and retrying (hardcoded for safety)
      return;
    }

    this.reconnectAttempts++;
    metrics.incrementCounter('rabbitmq_reconnect');
    
    // Exponential backoff: base delay * 2^attempts, capped at 60s max
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 60000);
    logger.info(`Attempting RabbitMQ reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay/1000}s...`);

    setTimeout(async () => {
      try {
        await this.connect();
        // Reset reconnection attempts on success
        this.reconnectAttempts = 0;
        logger.info('RabbitMQ reconnection successful');
        if (this.isConsuming) {
          await this.start();
        }
      } catch (error) {
        logger.warn('Reconnection attempt failed, will retry...', { error: error instanceof Error ? error.message : error });
      }
    }, delay);
  }

  async start(): Promise<void> {
    if (this.isConsuming) {
      logger.warn('RabbitMQ consumer already consuming');
      return;
    }

    if (!this.channel) {
      await this.connect();
    }

    try {
      await this.channel!.consume(this.queueName, async (msg: any) => {
        if (!msg) {
          return;
        }

        const startTime = Date.now();
        let ackSent = false;
        let content: any = null;
        let alarmId: number | string | null = null;

        try {
          // Parse message content first (may fail)
          content = JSON.parse(msg.content.toString());
          alarmId = content.alarmId || content.id || null;
          
          // Convert RabbitMQ message to Alarm object
          // Support both formats: Alarm Service format and Consumer Service format
          const alarm: Alarm = {
            id: content.alarmId || content.id,
            imei: content.imei,
            status: content.status,
            priority: content.priority || 5,
            scheduled_at: content.scheduledAt ? new Date(content.scheduledAt) : (content.scheduled_at ? new Date(content.scheduled_at) : undefined),
            is_email: content.channels?.email ? 1 : (content.is_email !== undefined ? (content.is_email ? 1 : 0) : 0),
            is_sms: content.channels?.sms ? 1 : (content.is_sms !== undefined ? (content.is_sms ? 1 : 0) : 0),
            is_call: content.channels?.voice ? 1 : (content.is_call !== undefined ? (content.is_call ? 1 : 0) : 0),
            state: content.state || {},
            category: content.category,
            retry_count: content.retry_count || 0,
            // GPS and tracking data (if available from message)
            server_time: content.server_time ? new Date(content.server_time) : new Date(),
            gps_time: content.gps_time ? new Date(content.gps_time) : new Date(),
            latitude: content.latitude || 0,
            longitude: content.longitude || 0,
            altitude: content.altitude || 0,
            angle: content.angle || 0,
            satellites: content.satellites || 0,
            speed: content.speed || 0,
            is_valid: 1,
            sms_sent: false,
            email_sent: false,
            call_sent: false,
            reference_id: content.reference_id,
            distance: content.distance,
            created_at: content.created_at ? new Date(content.created_at) : new Date(),
          };

          // Check if system is paused
          const messageId = alarm.id?.toString() || content.reference_id || `${alarm.imei}-${Date.now()}`;
          
          if (systemStateManager.isPaused()) {
            const wasNew = !this.pausedMessageIds.has(messageId);
            this.pausedMessageIds.add(messageId);
            
            // Store full alarm details for paused messages (for UI visibility)
            if (!this.pausedMessages.has(messageId)) {
              this.pausedMessages.set(messageId, { alarm, pausedAt: new Date() });
            }
            
            const now = Date.now();
            const uniqueCount = this.pausedMessageIds.size;
            
            // Only log periodically to avoid spam (every 30 seconds or when first message arrives)
            if (wasNew && uniqueCount === 1 || now - this.lastPauseLogTime >= this.PAUSE_LOG_INTERVAL) {
              logger.info(`System is paused - ${uniqueCount} unique message(s) waiting. Messages will be processed when resumed.`);
              this.lastPauseLogTime = now;
            }
            
            // Update metric for unique paused messages (not requeue cycles)
            metrics.setGauge('rabbitmq_paused_requeue_count', uniqueCount);
            
            // Requeue the message (nack with requeue = true)
            this.channel!.nack(msg, false, true);
            ackSent = true; // Mark as handled
            
            metrics.incrementCounter('rabbitmq_message_requeued_paused');
            
            // Wait longer to avoid tight loop and reduce CPU usage
            await new Promise(resolve => setTimeout(resolve, 5000));
            return;
          } else {
            // When resumed, log once and then track messages as they get processed
            if (this.pausedMessageIds.size > 0) {
              const remainingCount = this.pausedMessageIds.size;
              // Remove this message from the pending set as we're about to process it
              if (this.pausedMessageIds.has(messageId)) {
                this.pausedMessageIds.delete(messageId);
                this.pausedMessages.delete(messageId); // Remove from detailed tracking too
                const newCount = this.pausedMessageIds.size;
                // Update metric to show decreasing count
                metrics.setGauge('rabbitmq_paused_requeue_count', newCount);
                if (newCount === 0) {
                  logger.info(`All ${remainingCount} queued message(s) have been processed`);
                }
              }
            }
          }
          
          // Process alarms based on priority (higher priority first)
          // Priority 0-10, where 10 is highest
          const priority = content.priority || 5;
          
          // Process the alarm
          await alarmProcessor.processAlarm(alarm);

          // Acknowledge message
          this.channel!.ack(msg);
          ackSent = true;

          const duration = Date.now() - startTime;
          metrics.incrementCounter('rabbitmq_message_received');
          metrics.incrementCounter('rabbitmq_message_acknowledged');
          metrics.recordHistogram('rabbitmq_processing_duration_ms', duration);
          metrics.recordHistogram('rabbitmq_message_priority', priority);
          
          // Track priority-based metrics
          if (priority >= 8) {
            metrics.incrementCounter('rabbitmq_high_priority_processed');
          } else if (priority <= 2) {
            metrics.incrementCounter('rabbitmq_low_priority_processed');
          }
          
          // Update processing rate
          this.messagesProcessed++;
          this.updateProcessingRate();

          logger.debug(`Processed alarm ${alarm.id} from RabbitMQ`, {
            duration,
            priority
          });
        } catch (error: any) {
          logger.error('Error processing RabbitMQ message:', error);

          // Reject and requeue (will retry)
          if (!ackSent && this.channel) {
            const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;
            const newRetryCount = retryCount + 1;
            
            if (newRetryCount < 3) {
              // Republish with incremented retry count (nack doesn't allow header modification)
              const updatedHeaders = {
                ...(msg.properties.headers || {}),
                'x-retry-count': newRetryCount
              };
              
              // Acknowledge the original message
              this.channel.ack(msg);
              
              // Republish with updated retry count
              this.channel.publish(
                this.exchangeName,
                'alarm.notification',
                msg.content,
                {
                  ...msg.properties,
                  headers: updatedHeaders,
                  priority: msg.properties.priority || 5
                }
              );
              
              metrics.incrementCounter('rabbitmq_message_requeued');
              logger.warn(`Message requeued with retry count ${newRetryCount}/3`, {
                alarm_id: alarmId,
                error: error.message
              });
            } else {
              // Send to DLQ after max retries
              this.channel.nack(msg, false, false);
              metrics.incrementCounter('rabbitmq_message_dlq');
              logger.warn(`Message sent to DLQ after ${newRetryCount} retries`, {
                alarm_id: alarmId,
                error: error.message
              });
            }
          }
        }
      }, {
        noAck: false // Manual acknowledgment
      });

      this.isConsuming = true;
      logger.info('RabbitMQ consumer started');
    } catch (error: any) {
      logger.error('Failed to start RabbitMQ consumer:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isConsuming) {
      return;
    }

    try {
      if (this.channel) {
        await this.channel.cancel(this.queueName);
      }
      this.isConsuming = false;
      logger.info('RabbitMQ consumer stopped');
    } catch (error) {
      logger.error('Error stopping RabbitMQ consumer:', error);
    }
  }

  async close(): Promise<void> {
    await this.stop();
    
    // Stop queue monitoring
    if (this.queueMonitoringInterval) {
      clearInterval(this.queueMonitoringInterval);
      this.queueMonitoringInterval = null;
    }
    
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      metrics.setGauge('rabbitmq_connection_status', 0);
      logger.info('RabbitMQ consumer closed');
    } catch (error) {
      logger.error('Error closing RabbitMQ consumer:', error);
    }
  }

  isReady(): boolean {
    return this.isConsuming && this.channel !== null;
  }

  /**
   * Get details of paused messages (for UI visibility)
   */
  getPausedMessages(): Array<{
    messageId: string;
    alarm: Alarm;
    pausedAt: Date;
  }> {
    const result: Array<{ messageId: string; alarm: Alarm; pausedAt: Date }> = [];
    for (const [messageId, data] of this.pausedMessages.entries()) {
      result.push({
        messageId,
        alarm: data.alarm,
        pausedAt: data.pausedAt
      });
    }
    // Sort by pausedAt (oldest first)
    return result.sort((a, b) => a.pausedAt.getTime() - b.pausedAt.getTime());
  }

  /**
   * Get count of unique paused messages
   */
  getPausedMessageCount(): number {
    return this.pausedMessageIds.size;
  }
}

export default new RabbitMQConsumer();
