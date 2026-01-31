import * as client from 'prom-client';
import logger from './logger';

class Metrics {
  public register: client.Registry;
  public counters: { [key: string]: client.Counter };
  public gauges: { [key: string]: client.Gauge };
  public histograms: { [key: string]: client.Histogram };

  constructor() {
    this.register = new client.Registry();
    
    client.collectDefaultMetrics({ register: this.register });
    
    this.counters = {
      alarms_processed_total: new client.Counter({
        name: 'alarms_processed_total',
        help: 'Total number of alarms processed',
        registers: [this.register]
      }),
      email_sent_total: new client.Counter({
        name: 'email_sent_total',
        help: 'Total number of emails sent successfully',
        registers: [this.register]
      }),
      sms_sent_total: new client.Counter({
        name: 'sms_sent_total',
        help: 'Total number of SMS sent successfully',
        labelNames: ['modem', 'status'],
        registers: [this.register]
      }),
      email_send_error: new client.Counter({
        name: 'email_send_error',
        help: 'Total number of email send errors',
        registers: [this.register]
      }),
      sms_send_error: new client.Counter({
        name: 'sms_send_error',
        help: 'Total number of SMS send errors',
        registers: [this.register]
      }),
      email_send_failed_permanent: new client.Counter({
        name: 'email_send_failed_permanent',
        help: 'Total number of permanently failed emails (after max retries)',
        registers: [this.register]
      }),
      sms_send_failed_permanent: new client.Counter({
        name: 'sms_send_failed_permanent',
        help: 'Total number of permanently failed SMS (after max retries)',
        registers: [this.register]
      }),
      email_send_retry: new client.Counter({
        name: 'email_send_retry',
        help: 'Total number of email send retries',
        registers: [this.register]
      }),
      sms_send_retry: new client.Counter({
        name: 'sms_send_retry',
        help: 'Total number of SMS send retries',
        registers: [this.register]
      }),
      // Modem selection tier metrics
      sms_sent_dedicated: new client.Counter({
        name: 'sms_sent_dedicated',
        help: 'SMS sent via dedicated modem (device or service pool)',
        labelNames: ['service', 'tier'],
        registers: [this.register]
      }),
      sms_sent_fallback: new client.Counter({
        name: 'sms_sent_fallback',
        help: 'SMS sent via fallback (any available modem)',
        labelNames: ['service'],
        registers: [this.register]
      }),
      sms_device_modem_not_found: new client.Counter({
        name: 'sms_device_modem_not_found',
        help: 'Device modem_id not found or unavailable',
        labelNames: ['service'],
        registers: [this.register]
      }),
      sms_service_pool_exhausted: new client.Counter({
        name: 'sms_service_pool_exhausted',
        help: 'Service pool exhausted, fell back to any modem',
        labelNames: ['service'],
        registers: [this.register]
      }),
      sms_all_modems_exhausted: new client.Counter({
        name: 'sms_all_modems_exhausted',
        help: 'All modems exhausted, SMS failed',
        labelNames: ['service'],
        registers: [this.register]
      }),
      alarm_batch_error: new client.Counter({
        name: 'alarm_batch_error',
        help: 'Number of batch processing errors',
        registers: [this.register]
      }),
      alarm_batch_cancelled: new client.Counter({
        name: 'alarm_batch_cancelled',
        help: 'Total number of alarms cancelled in batch operations',
        registers: [this.register]
      }),
      alarm_processing_error: new client.Counter({
        name: 'alarm_processing_error',
        help: 'Number of individual alarm processing errors',
        registers: [this.register]
      }),
      // RabbitMQ Metrics
      rabbitmq_message_received: new client.Counter({
        name: 'rabbitmq_message_received',
        help: 'Total number of messages received from RabbitMQ',
        registers: [this.register]
      }),
      rabbitmq_message_acknowledged: new client.Counter({
        name: 'rabbitmq_message_acknowledged',
        help: 'Total number of messages acknowledged',
        registers: [this.register]
      }),
      rabbitmq_message_requeued: new client.Counter({
        name: 'rabbitmq_message_requeued',
        help: 'Total number of messages requeued for retry',
        registers: [this.register]
      }),
      rabbitmq_message_dlq: new client.Counter({
        name: 'rabbitmq_message_dlq',
        help: 'Total number of messages sent to DLQ',
        registers: [this.register]
      }),
      rabbitmq_connection_error: new client.Counter({
        name: 'rabbitmq_connection_error',
        help: 'Total number of RabbitMQ connection errors',
        registers: [this.register]
      }),
      // LISTEN/NOTIFY Metrics
      listen_notify_alarm_received: new client.Counter({
        name: 'listen_notify_alarm_received',
        help: 'Total number of alarms received via PostgreSQL LISTEN/NOTIFY',
        registers: [this.register]
      }),
      rabbitmq_reconnect: new client.Counter({
        name: 'rabbitmq_reconnect',
        help: 'Total number of RabbitMQ reconnection attempts',
        registers: [this.register]
      }),
      email_circuit_breaker_open: new client.Counter({
        name: 'email_circuit_breaker_open',
        help: 'Number of times email circuit breaker was open',
        registers: [this.register]
      }),
      sms_circuit_breaker_open: new client.Counter({
        name: 'sms_circuit_breaker_open',
        help: 'Number of times SMS circuit breaker was open',
        registers: [this.register]
      }),
      voice_sent_total: new client.Counter({
        name: 'voice_sent_total',
        help: 'Total number of voice calls sent successfully',
        registers: [this.register]
      }),
      voice_send_error: new client.Counter({
        name: 'voice_send_error',
        help: 'Total number of voice call send errors',
        registers: [this.register]
      }),
      voice_send_failed_permanent: new client.Counter({
        name: 'voice_send_failed_permanent',
        help: 'Total number of permanently failed voice calls (after max retries)',
        registers: [this.register]
      }),
      voice_send_retry: new client.Counter({
        name: 'voice_send_retry',
        help: 'Total number of voice call send retries',
        registers: [this.register]
      }),
      voice_circuit_breaker_open: new client.Counter({
        name: 'voice_circuit_breaker_open',
        help: 'Number of times voice circuit breaker was open',
        registers: [this.register]
      }),
      email_send_skipped_duplicate: new client.Counter({
        name: 'email_send_skipped_duplicate',
        help: 'Number of email sends skipped due to duplicate (idempotency)',
        registers: [this.register]
      }),
      sms_send_skipped_duplicate: new client.Counter({
        name: 'sms_send_skipped_duplicate',
        help: 'Number of SMS sends skipped due to duplicate (idempotency)',
        registers: [this.register]
      }),
      voice_send_skipped_duplicate: new client.Counter({
        name: 'voice_send_skipped_duplicate',
        help: 'Number of voice calls skipped due to duplicate (idempotency)',
        registers: [this.register]
      }),
      sms_api_health_check_failed: new client.Counter({
        name: 'sms_api_health_check_failed',
        help: 'Number of SMS API health check failures',
        registers: [this.register]
      }),
      voice_api_health_check_failed: new client.Counter({
        name: 'voice_api_health_check_failed',
        help: 'Number of Voice API health check failures',
        registers: [this.register]
      }),
      alarm_backpressure_applied: new client.Counter({
        name: 'alarm_backpressure_applied',
        help: 'Number of times backpressure was applied due to queue depth',
        registers: [this.register]
      }),
      dlq_reprocessed_total: new client.Counter({
        name: 'dlq_reprocessed_total',
        help: 'Total number of DLQ items reprocessed',
        registers: [this.register]
      }),
      dlq_reprocess_error: new client.Counter({
        name: 'dlq_reprocess_error',
        help: 'Number of DLQ reprocessing errors',
        registers: [this.register]
      }),
      dlq_batch_reprocessed: new client.Counter({
        name: 'dlq_batch_reprocessed',
        help: 'Number of DLQ items reprocessed in batches',
        registers: [this.register]
      }),
      dlq_batch_failed: new client.Counter({
        name: 'dlq_batch_failed',
        help: 'Number of DLQ items that failed during batch reprocessing',
        registers: [this.register]
      }),
      // Cost and Count Metrics (Counters for totals)
      notification_cost_total_email: new client.Counter({
        name: 'notification_cost_total_email',
        help: 'Total cost of email notifications in USD',
        registers: [this.register]
      }),
      notification_cost_total_sms: new client.Counter({
        name: 'notification_cost_total_sms',
        help: 'Total cost of SMS notifications in USD',
        registers: [this.register]
      }),
      notification_cost_total_voice: new client.Counter({
        name: 'notification_cost_total_voice',
        help: 'Total cost of voice notifications in USD',
        registers: [this.register]
      }),
      notification_count_by_channel_email: new client.Counter({
        name: 'notification_count_by_channel_email',
        help: 'Total number of email notifications sent',
        registers: [this.register]
      }),
      notification_count_by_channel_sms: new client.Counter({
        name: 'notification_count_by_channel_sms',
        help: 'Total number of SMS notifications sent',
        registers: [this.register]
      }),
      notification_count_by_channel_voice: new client.Counter({
        name: 'notification_count_by_channel_voice',
        help: 'Total number of voice notifications sent',
        registers: [this.register]
      }),
      // Database Pool Metrics (Counters)
      db_pool_connect: new client.Counter({
        name: 'db_pool_connect',
        help: 'Total number of database pool connections',
        registers: [this.register]
      }),
      db_pool_remove: new client.Counter({
        name: 'db_pool_remove',
        help: 'Total number of database pool connection removals',
        registers: [this.register]
      }),
      db_pool_error: new client.Counter({
        name: 'db_pool_error',
        help: 'Total number of database pool errors',
        registers: [this.register]
      }),
      // Push Notification Metrics
      push_notifications_sent_total: new client.Counter({
        name: 'push_notifications_sent_total',
        help: 'Total number of push notifications sent',
        labelNames: ['status'],
        registers: [this.register]
      }),
      push_device_token_registered: new client.Counter({
        name: 'push_device_token_registered',
        help: 'Total number of push device tokens registered',
        registers: [this.register]
      }),
      push_device_token_unregistered: new client.Counter({
        name: 'push_device_token_unregistered',
        help: 'Total number of push device tokens unregistered',
        registers: [this.register]
      }),
      push_invalid_token_removed: new client.Counter({
        name: 'push_invalid_token_removed',
        help: 'Total number of invalid push device tokens removed',
        registers: [this.register]
      }),
      // SMS Modem Pool Metrics
      sms_modem_health_check_failed: new client.Counter({
        name: 'sms_modem_health_check_failed',
        help: 'Total number of SMS modem health check failures',
        labelNames: ['modem'],
        registers: [this.register]
      }),
      sms_modem_failover: new client.Counter({
        name: 'sms_modem_failover',
        help: 'Total number of SMS modem failovers',
        registers: [this.register]
      }),
      // System State Metrics
      system_pause_count: new client.Counter({
        name: 'system_pause_count',
        help: 'Total number of times system was paused',
        registers: [this.register]
      }),
      system_resume_count: new client.Counter({
        name: 'system_resume_count',
        help: 'Total number of times system was resumed',
        registers: [this.register]
      }),
      rabbitmq_message_requeued_paused: new client.Counter({
        name: 'rabbitmq_message_requeued_paused',
        help: 'Total number of messages requeued due to system pause',
        registers: [this.register]
      }),
      // Worker Counters
      worker_heartbeat: new client.Counter({
        name: 'worker_heartbeat',
        help: 'Total number of worker heartbeats sent',
        registers: [this.register]
      }),
      dead_workers_removed: new client.Counter({
        name: 'dead_workers_removed',
        help: 'Total number of dead workers removed during cleanup',
        registers: [this.register]
      })
    };
    
    this.gauges = {
      alarm_queue_size: new client.Gauge({
        name: 'alarm_queue_size',
        help: 'Current number of unsent alarms in queue',
        registers: [this.register]
      }),
      pending_sms_count: new client.Gauge({
        name: 'pending_sms_count',
        help: 'Number of pending SMS notifications',
        registers: [this.register]
      }),
      pending_email_count: new client.Gauge({
        name: 'pending_email_count',
        help: 'Number of pending email notifications',
        registers: [this.register]
      }),
      // RabbitMQ Metrics
      rabbitmq_queue_depth: new client.Gauge({
        name: 'rabbitmq_queue_depth',
        help: 'Current number of messages in RabbitMQ queue',
        registers: [this.register]
      }),
      rabbitmq_consumer_lag_ms: new client.Gauge({
        name: 'rabbitmq_consumer_lag_ms',
        help: 'Consumer lag in milliseconds (time since oldest unprocessed message)',
        registers: [this.register]
      }),
      rabbitmq_connection_status: new client.Gauge({
        name: 'rabbitmq_connection_status',
        help: 'RabbitMQ connection status (1=connected, 0=disconnected)',
        registers: [this.register]
      }),
      rabbitmq_messages_processed_rate: new client.Gauge({
        name: 'rabbitmq_messages_processed_rate',
        help: 'Messages processed per second',
        registers: [this.register]
      }),
      rabbitmq_queue_messages_ready: new client.Gauge({
        name: 'rabbitmq_queue_messages_ready',
        help: 'Number of ready messages in RabbitMQ queue',
        registers: [this.register]
      }),
      rabbitmq_queue_consumer_count: new client.Gauge({
        name: 'rabbitmq_queue_consumer_count',
        help: 'Number of consumers on RabbitMQ queue',
        registers: [this.register]
      }),
      rabbitmq_paused_requeue_count: new client.Gauge({
        name: 'rabbitmq_paused_requeue_count',
        help: 'Number of messages requeued while system is paused',
        registers: [this.register]
      }),
      // Worker Metrics
      active_workers_count: new client.Gauge({
        name: 'active_workers_count',
        help: 'Number of active workers',
        registers: [this.register]
      }),
      stale_workers_count: new client.Gauge({
        name: 'stale_workers_count',
        help: 'Number of stale workers',
        registers: [this.register]
      }),
      worker_registered: new client.Gauge({
        name: 'worker_registered',
        help: 'Whether this worker is registered (1=registered, 0=not)',
        registers: [this.register]
      }),
      // Channel Availability Metrics
      email_channel_available: new client.Gauge({
        name: 'email_channel_available',
        help: 'Email channel availability (1=available, 0=unavailable)',
        registers: [this.register]
      }),
      sms_channel_available: new client.Gauge({
        name: 'sms_channel_available',
        help: 'SMS channel availability (1=available, 0=unavailable)',
        registers: [this.register]
      }),
      voice_channel_available: new client.Gauge({
        name: 'voice_channel_available',
        help: 'Voice channel availability (1=available, 0=unavailable)',
        registers: [this.register]
      }),
      dlq_size: new client.Gauge({
        name: 'dlq_size',
        help: 'Current number of items in Dead Letter Queue',
        registers: [this.register]
      }),
      // Database Pool Metrics (Gauges)
      db_pool_total: new client.Gauge({
        name: 'db_pool_total',
        help: 'Total number of connections in the database pool',
        registers: [this.register]
      }),
      db_pool_idle: new client.Gauge({
        name: 'db_pool_idle',
        help: 'Number of idle connections in the database pool',
        registers: [this.register]
      }),
      db_pool_waiting: new client.Gauge({
        name: 'db_pool_waiting',
        help: 'Number of waiting requests for database connections',
        registers: [this.register]
      }),
      db_pool_healthy: new client.Gauge({
        name: 'db_pool_healthy',
        help: 'Database pool health status (1=healthy, 0=unhealthy)',
        registers: [this.register]
      }),
      // SLA Tracking Metrics - Success Rates (Gauges)
      notification_success_rate_email: new client.Gauge({
        name: 'notification_success_rate_email',
        help: 'Email notification success rate (0-1)',
        registers: [this.register]
      }),
      notification_success_rate_sms: new client.Gauge({
        name: 'notification_success_rate_sms',
        help: 'SMS notification success rate (0-1)',
        registers: [this.register]
      }),
      notification_success_rate_voice: new client.Gauge({
        name: 'notification_success_rate_voice',
        help: 'Voice notification success rate (0-1)',
        registers: [this.register]
      }),
      // SLA Tracking Metrics - Compliance (Gauges)
      notification_sla_compliance_email: new client.Gauge({
        name: 'notification_sla_compliance_email',
        help: 'Email SLA compliance rate (0-1)',
        registers: [this.register]
      }),
      notification_sla_compliance_sms: new client.Gauge({
        name: 'notification_sla_compliance_sms',
        help: 'SMS SLA compliance rate (0-1)',
        registers: [this.register]
      }),
      notification_sla_compliance_voice: new client.Gauge({
        name: 'notification_sla_compliance_voice',
        help: 'Voice SLA compliance rate (0-1)',
        registers: [this.register]
      }),
      // Cost Tracking Metrics - Per Message (Gauges)
      notification_cost_per_message_email: new client.Gauge({
        name: 'notification_cost_per_message_email',
        help: 'Average cost per email notification in USD',
        registers: [this.register]
      }),
      notification_cost_per_message_sms: new client.Gauge({
        name: 'notification_cost_per_message_sms',
        help: 'Average cost per SMS notification in USD',
        registers: [this.register]
      }),
      notification_cost_per_message_voice: new client.Gauge({
        name: 'notification_cost_per_message_voice',
        help: 'Average cost per voice notification in USD',
        registers: [this.register]
      }),
      // DLQ Metrics
      dlq_total_items: new client.Gauge({
        name: 'dlq_total_items',
        help: 'Total number of items in Dead Letter Queue',
        registers: [this.register]
      }),
      dlq_average_age_ms: new client.Gauge({
        name: 'dlq_average_age_ms',
        help: 'Average age of DLQ items in milliseconds',
        registers: [this.register]
      }),
      dlq_max_attempts: new client.Gauge({
        name: 'dlq_max_attempts',
        help: 'Maximum number of attempts for DLQ items',
        registers: [this.register]
      }),
      // SMS Modem Pool Gauges
      sms_modem_pool_size: new client.Gauge({
        name: 'sms_modem_pool_size',
        help: 'Total number of SMS modems in the pool',
        registers: [this.register]
      }),
      sms_modem_healthy_count: new client.Gauge({
        name: 'sms_modem_healthy_count',
        help: 'Number of healthy SMS modems',
        registers: [this.register]
      }),
      sms_modem_degraded_count: new client.Gauge({
        name: 'sms_modem_degraded_count',
        help: 'Number of degraded SMS modems',
        registers: [this.register]
      }),
      sms_modem_unhealthy_count: new client.Gauge({
        name: 'sms_modem_unhealthy_count',
        help: 'Number of unhealthy SMS modems',
        registers: [this.register]
      }),
      sms_modem_quota_exhausted_count: new client.Gauge({
        name: 'sms_modem_quota_exhausted_count',
        help: 'Number of SMS modems with exhausted quota',
        registers: [this.register]
      }),
      sms_modem_usage_count: new client.Gauge({
        name: 'sms_modem_usage_count',
        help: 'Current SMS usage count per modem',
        labelNames: ['modem_name'],
        registers: [this.register]
      }),
      sms_modem_usage_limit: new client.Gauge({
        name: 'sms_modem_usage_limit',
        help: 'SMS limit per modem',
        labelNames: ['modem_name'],
        registers: [this.register]
      }),
      // System State Gauges
      system_paused: new client.Gauge({
        name: 'system_paused',
        help: 'System pause state (1=paused, 0=running)',
        registers: [this.register]
      }),
      system_mock_mode_sms: new client.Gauge({
        name: 'system_mock_mode_sms',
        help: 'SMS mock mode state (1=mock, 0=real)',
        registers: [this.register]
      }),
      system_mock_mode_email: new client.Gauge({
        name: 'system_mock_mode_email',
        help: 'Email mock mode state (1=mock, 0=real)',
        registers: [this.register]
      }),
      // Push Notification Gauges
      push_channel_available: new client.Gauge({
        name: 'push_channel_available',
        help: 'Push notification channel availability (1=available, 0=unavailable)',
        registers: [this.register]
      }),
      alarms_push_tokens_active: new client.Gauge({
        name: 'alarms_push_tokens_active',
        help: 'Number of active push device tokens',
        registers: [this.register]
      })
    };
    
    this.histograms = {
      alarm_processing_duration_ms: new client.Histogram({
        name: 'alarm_processing_duration_ms',
        help: 'Time to process a single alarm in milliseconds',
        buckets: [100, 500, 1000, 2000, 5000, 10000],
        registers: [this.register]
      }),
      alarm_batch_duration_ms: new client.Histogram({
        name: 'alarm_batch_duration_ms',
        help: 'Time to process a batch of alarms in milliseconds',
        buckets: [500, 1000, 2000, 5000, 10000, 30000],
        registers: [this.register]
      }),
      email_send_duration_ms: new client.Histogram({
        name: 'email_send_duration_ms',
        help: 'Time to send an email in milliseconds',
        buckets: [100, 500, 1000, 2000, 5000, 10000],
        registers: [this.register]
      }),
      sms_send_duration_ms: new client.Histogram({
        name: 'sms_send_duration_ms',
        help: 'Time to send an SMS in milliseconds',
        buckets: [100, 500, 1000, 2000, 5000, 10000],
        registers: [this.register]
      }),
      voice_send_duration_ms: new client.Histogram({
        name: 'voice_send_duration_ms',
        help: 'Time to make a voice call in milliseconds',
        buckets: [1000, 2000, 5000, 10000, 30000, 60000],
        registers: [this.register]
      }),
      rabbitmq_processing_duration_ms: new client.Histogram({
        name: 'rabbitmq_processing_duration_ms',
        help: 'Time to process a message from RabbitMQ in milliseconds',
        buckets: [100, 500, 1000, 2000, 5000, 10000],
        registers: [this.register]
      }),
      // LISTEN/NOTIFY Delay Histogram
      listen_notify_delay_ms: new client.Histogram({
        name: 'listen_notify_delay_ms',
        help: 'Delay between alarm creation and PostgreSQL LISTEN/NOTIFY receipt in milliseconds',
        buckets: [10, 50, 100, 250, 500, 1000, 2000, 5000],
        registers: [this.register]
      }),
      // SLA Tracking Metrics - Delivery Time (Histograms)
      notification_delivery_time_ms_email: new client.Histogram({
        name: 'notification_delivery_time_ms_email',
        help: 'Time from alarm creation to email delivery in milliseconds',
        buckets: [1000, 5000, 10000, 30000, 60000, 120000, 300000],
        registers: [this.register]
      }),
      notification_delivery_time_ms_sms: new client.Histogram({
        name: 'notification_delivery_time_ms_sms',
        help: 'Time from alarm creation to SMS delivery in milliseconds',
        buckets: [1000, 5000, 10000, 30000, 60000, 120000, 300000],
        registers: [this.register]
      }),
      notification_delivery_time_ms_voice: new client.Histogram({
        name: 'notification_delivery_time_ms_voice',
        help: 'Time from alarm creation to voice delivery in milliseconds',
        buckets: [1000, 5000, 10000, 30000, 60000, 120000, 300000],
        registers: [this.register]
      }),
      // RabbitMQ Priority Metrics
      rabbitmq_message_priority: new client.Histogram({
        name: 'rabbitmq_message_priority',
        help: 'Priority of messages processed from RabbitMQ',
        buckets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        registers: [this.register]
      })
    };
  }

  incrementCounter(name: string, labelsOrValue?: Record<string, string> | number, value?: number): void {
    if (this.counters[name]) {
      // Handle overloads: incrementCounter(name, labels) or incrementCounter(name, value) or incrementCounter(name, labels, value)
      if (typeof labelsOrValue === 'object' && labelsOrValue !== null) {
        // Labels provided
        this.counters[name].inc(labelsOrValue, value || 1);
      } else if (typeof labelsOrValue === 'number') {
        // Value provided directly
        this.counters[name].inc(labelsOrValue);
      } else {
        // No labels or value, increment by 1
        this.counters[name].inc(1);
      }
    } else {
      logger.warn(`Counter ${name} not found`);
    }
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    if (this.gauges[name]) {
      if (labels) {
        this.gauges[name].set(labels, value);
      } else {
        this.gauges[name].set(value);
      }
    } else {
      logger.warn(`Gauge ${name} not found`);
    }
  }

  recordHistogram(name: string, value: number): void {
    if (this.histograms[name]) {
      this.histograms[name].observe(value);
    } else {
      logger.warn(`Histogram ${name} not found`);
    }
  }

  async getMetrics(): Promise<string> {
    return await this.register.metrics();
  }

  async getAllMetrics(): Promise<any[]> {
    return await this.register.getMetricsAsJSON();
  }

  /**
   * Get SLA metrics (P50, P95, P99) for a histogram
   */
  async getSLAMetrics(histogramName: string): Promise<{
    p50: number;
    p95: number;
    p99: number;
    mean: number;
  } | null> {
    try {
      const metrics = await this.getAllMetrics();
      const histogram = metrics.find(m => m.name === histogramName && m.type === 'histogram');
      
      if (!histogram || !histogram.values) {
        return null;
      }
      
      // Calculate percentiles from histogram buckets
      const buckets = histogram.values.filter((v: any) => v.labels && v.labels.le);
      if (buckets.length === 0) {
        return null;
      }
      
      // For simplicity, return bucket values
      // In production, use proper percentile calculation from histogram
      const sortedBuckets = buckets.sort((a: any, b: any) => {
        const aLe = parseFloat(a.labels?.le || '0');
        const bLe = parseFloat(b.labels?.le || '0');
        return aLe - bLe;
      });
      
      const p50Index = Math.floor(sortedBuckets.length * 0.5);
      const p95Index = Math.floor(sortedBuckets.length * 0.95);
      const p99Index = Math.floor(sortedBuckets.length * 0.99);
      
      return {
        p50: parseFloat(sortedBuckets[p50Index]?.labels?.le || '0'),
        p95: parseFloat(sortedBuckets[p95Index]?.labels?.le || '0'),
        p99: parseFloat(sortedBuckets[p99Index]?.labels?.le || '0'),
        mean: parseFloat(sortedBuckets[Math.floor(sortedBuckets.length / 2)]?.labels?.le || '0'),
      };
    } catch (error) {
      logger.error(`Error getting SLA metrics for ${histogramName}:`, error);
      return null;
    }
  }

  async logSummary(): Promise<void> {
    try {
      const metrics = await this.getAllMetrics();
      
      const summary: { [key: string]: any } = {};
      metrics.forEach(metric => {
        if (metric.type === 'counter') {
          summary[metric.name] = metric.values[0]?.value || 0;
        } else if (metric.type === 'gauge') {
          summary[metric.name] = metric.values[0]?.value || 0;
        } else if (metric.type === 'histogram') {
          // Get SLA metrics for histograms
          this.getSLAMetrics(metric.name).then(sla => {
            if (sla) {
              summary[`${metric.name}_p95`] = sla.p95;
              summary[`${metric.name}_p99`] = sla.p99;
            }
          }).catch(() => {});
        }
      });
      
      logger.info('Metrics Summary', summary);
    } catch (error) {
      logger.error('Error logging metrics summary:', error);
    }
  }

  reset(): void {
    this.register.resetMetrics();
    logger.info('Metrics reset');
  }
}

export default new Metrics();
