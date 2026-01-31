import * as dotenv from 'dotenv';
import { Config } from '../types';

dotenv.config();

const required = ['DB_PASSWORD'];

const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  console.error('Please copy .env.example to .env and fill in the values');
  process.exit(1);
}

const config: Config = {
  database: {
    host: process.env.DB_HOST || 'postgres-primary',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tracking_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD!,
    max: parseInt(process.env.DB_POOL_MAX || '10'),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '2000'),
  },
  
  email: {
    host: process.env.EMAIL_HOST || 'localhost',
    port: parseInt(process.env.EMAIL_PORT || '25'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER || '',
      pass: process.env.EMAIL_PASSWORD || '',
    },
    from: process.env.EMAIL_FROM || 'noreply@tracking.com',
  },
  
  sms: {
    apiUrl: process.env.SMS_API_URL || '',
    apiKey: process.env.SMS_API_KEY || '',
    from: process.env.SMS_FROM || 'TrackingAlarm',
  },
  
  alarm: {
    retryBaseDelay: parseInt(process.env.RETRY_BASE_DELAY || '1000'),
    retryMaxDelay: parseInt(process.env.RETRY_MAX_DELAY || '60000'),
    dedupWindowMinutes: parseInt(process.env.DEDUP_WINDOW_MINUTES || '5'),
  },
  channels: {
    email: {
      maxRetries: parseInt(process.env.EMAIL_MAX_RETRIES || '5'),
      maxConcurrency: parseInt(process.env.EMAIL_MAX_CONCURRENCY || '5'),
    },
    sms: {
      maxRetries: parseInt(process.env.SMS_MAX_RETRIES || '3'),
      maxConcurrency: parseInt(process.env.SMS_MAX_CONCURRENCY || '5'),
    },
    voice: {
      maxRetries: parseInt(process.env.VOICE_MAX_RETRIES || '2'),
      maxConcurrency: parseInt(process.env.VOICE_MAX_CONCURRENCY || '3'),
    },
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: 'logs/alarm.log',
    maxSize: '10m',
    maxFiles: 5,
  },
  
  fallback: {
    email: process.env.DEFAULT_ALARM_EMAIL || 'admin@example.com',
    phone: process.env.DEFAULT_ALARM_PHONE || '+1234567890',
  },
  
  // Circuit Breaker Configuration
  circuitBreaker: {
    failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5', 10),
    successThreshold: parseInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '2', 10),
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '60000', 10),
  },
  
  // Database Pool Configuration
  dbPool: {
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    target: parseInt(process.env.DB_POOL_TARGET || '10', 10),
    monitorInterval: parseInt(process.env.DB_POOL_MONITOR_INTERVAL || '60000', 10),
  },
  
  // RabbitMQ Configuration
  rabbitmq: {
    exchange: process.env.RABBITMQ_EXCHANGE || 'alarm_exchange',
    queue: process.env.RABBITMQ_QUEUE || 'alarm_notifications',
    prefetch: parseInt(process.env.RABBITMQ_PREFETCH || '10', 10),
    maxReconnectAttempts: parseInt(process.env.RABBITMQ_MAX_RECONNECT_ATTEMPTS || '10', 10),
    reconnectDelay: parseInt(process.env.RABBITMQ_RECONNECT_DELAY || '5000', 10),
    queueMonitoringInterval: parseInt(process.env.RABBITMQ_QUEUE_MONITOR_INTERVAL || '10000', 10),
  },
  
  // Webhook Configuration
  webhook: {
    secret: process.env.WEBHOOK_SECRET || '',
    rateLimitWindow: parseInt(process.env.WEBHOOK_RATE_LIMIT_WINDOW || '60000', 10),
    rateLimitMax: parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX || '100', 10),
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '1000', 10),
  },
  
  // Worker Registry Configuration
  workerRegistry: {
    heartbeatInterval: parseInt(process.env.WORKER_HEARTBEAT_INTERVAL || '30000', 10),
    cleanupInterval: parseInt(process.env.WORKER_CLEANUP_INTERVAL || '60000', 10),
    staleThreshold: parseInt(process.env.WORKER_STALE_THRESHOLD || '300000', 10),
    deadThreshold: parseInt(process.env.WORKER_DEAD_THRESHOLD || '600000', 10),
  },
  
  // DLQ Reprocessor Configuration
  dlq: {
    alertThreshold: parseInt(process.env.DLQ_ALERT_THRESHOLD || '100', 10),
    maxBackoffMs: parseInt(process.env.DLQ_MAX_BACKOFF_MS || '300000', 10),
    baseBackoffMs: parseInt(process.env.DLQ_BASE_BACKOFF_MS || '1000', 10),
    autoReprocessInterval: parseInt(process.env.DLQ_AUTO_REPROCESS_INTERVAL || '5000', 10),  // 5s instead of 60s
    autoReprocessBatchSize: parseInt(process.env.DLQ_AUTO_REPROCESS_BATCH_SIZE || '200', 10),  // 200 instead of 50
  },
  
  // Feature Flags Configuration
  featureFlags: {
    refreshInterval: parseInt(process.env.FEATURE_FLAGS_REFRESH_INTERVAL || '60000', 10),
  },
  
  // Template Versioning Configuration
  templateVersioning: {
    refreshInterval: parseInt(process.env.TEMPLATE_REFRESH_INTERVAL || '300000', 10),
  },
  
  // SLA Configuration
  sla: {
    emailThresholdMs: parseInt(process.env.EMAIL_SLA_THRESHOLD_MS || '30000', 10),
    smsThresholdMs: parseInt(process.env.SMS_SLA_THRESHOLD_MS || '10000', 10),
    voiceThresholdMs: parseInt(process.env.VOICE_SLA_THRESHOLD_MS || '60000', 10),
  },
  
  // Cost Configuration
  cost: {
    emailPerMessage: parseFloat(process.env.EMAIL_COST_PER_MESSAGE || '0.001'),
    smsPerMessage: parseFloat(process.env.SMS_COST_PER_MESSAGE || '0.01'),
    voicePerMessage: parseFloat(process.env.VOICE_COST_PER_MESSAGE || '0.05'),
  },
  
  // Auto-reprocessing Configuration
  autoReprocess: {
    enabled: process.env.AUTO_REPROCESS_ON_STARTUP !== 'false',
    startupLimit: parseInt(process.env.STARTUP_REPROCESS_LIMIT || '50', 10),
    periodicInterval: parseInt(process.env.PENDING_ALARM_REPROCESS_INTERVAL || '300000', 10),
    periodicLimit: parseInt(process.env.PENDING_ALARM_REPROCESS_LIMIT || '20', 10),
  },
  
  // Server Configuration
  server: {
    healthPort: parseInt(process.env.HEALTH_PORT || '3100', 10),
  },
  
  // Startup Configuration
  startup: {
    maxRetries: parseInt(process.env.STARTUP_MAX_RETRIES || '10', 10),
    retryDelayBase: parseInt(process.env.STARTUP_RETRY_DELAY_BASE || '5000', 10),
    retryDelayMax: parseInt(process.env.STARTUP_RETRY_DELAY_MAX || '30000', 10),
  }
};

export default config;
