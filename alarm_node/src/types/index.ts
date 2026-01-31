export interface Alarm {
  id: number | string;
  imei: number | string;
  server_time: Date;
  gps_time: Date;
  latitude: number;
  longitude: number;
  altitude: number;
  angle: number;
  satellites: number;
  speed: number;
  status: string;
  is_sms: boolean | number;
  is_email: boolean | number;
  is_call: boolean | number;
  is_valid: boolean | number;
  reference_id?: number | null;
  distance?: number | null;
  sms_sent: boolean;
  email_sent: boolean;
  call_sent?: boolean;
  sms_sent_at?: Date | null;
  email_sent_at?: Date | null;
  call_sent_at?: Date | null;
  retry_count?: number;
  scheduled_at?: Date;
  priority?: number;
  state?: Record<string, any>;
  category?: string;
  created_at?: Date;
}

export interface Contact {
  email?: string | null;
  phone?: string | null;
  contact_name?: string;
  priority?: number;
  active?: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  timezone?: string;
  bounce_count?: number;
  last_bounce_at?: Date | null;
}

export interface DeliveryResult {
  success: boolean;
  messageId?: string | null;
  provider: string;
  recipients: RecipientResult[];
  modemId?: number | null;      // ID of modem used for SMS (from alarms_sms_modems)
  modemName?: string | null;    // Name of modem used for SMS
}

export interface RecipientResult {
  recipient: string;
  success: boolean;
  providerId: string | null;
  modemId?: number | null;      // ID of modem used for this recipient's SMS
  modemName?: string | null;    // Name of modem used for this recipient's SMS
}

export interface Config {
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max: number;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
  };
  email: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
    from: string;
  };
  sms: {
    apiUrl: string;
    apiKey: string;
    from: string;
  };
  alarm: {
    retryBaseDelay: number;
    retryMaxDelay: number;
    dedupWindowMinutes: number;
  };
  channels: {
    email: {
      maxRetries: number;
      maxConcurrency: number;
    };
    sms: {
      maxRetries: number;
      maxConcurrency: number;
    };
    voice: {
      maxRetries: number;
      maxConcurrency: number;
    };
  };
  logging: {
    level: string;
    file: string;
    maxSize: string;
    maxFiles: number;
  };
  fallback: {
    email: string;
    phone: string;
  };
  circuitBreaker: {
    failureThreshold: number;
    successThreshold: number;
    timeout: number;
  };
  dbPool: {
    min: number;
    max: number;
    target: number;
    monitorInterval: number;
  };
  rabbitmq: {
    exchange: string;
    queue: string;
    prefetch: number;
    maxReconnectAttempts: number;
    reconnectDelay: number;
    queueMonitoringInterval: number;
  };
  webhook: {
    secret: string;
    rateLimitWindow: number;
    rateLimitMax: number;
    retryAttempts: number;
    retryDelay: number;
  };
  workerRegistry: {
    heartbeatInterval: number;
    cleanupInterval: number;
    staleThreshold: number;
    deadThreshold: number;
  };
  dlq: {
    alertThreshold: number;
    maxBackoffMs: number;
    baseBackoffMs: number;
    autoReprocessInterval: number;
    autoReprocessBatchSize: number;
  };
  featureFlags: {
    refreshInterval: number;
  };
  templateVersioning: {
    refreshInterval: number;
  };
  sla: {
    emailThresholdMs: number;
    smsThresholdMs: number;
    voiceThresholdMs: number;
  };
  cost: {
    emailPerMessage: number;
    smsPerMessage: number;
    voicePerMessage: number;
  };
  autoReprocess: {
    enabled: boolean;
    startupLimit: number;
    periodicInterval: number;
    periodicLimit: number;
  };
  server: {
    healthPort: number;
  };
  startup: {
    maxRetries: number;
    retryDelayBase: number;
    retryDelayMax: number;
  };
}

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  shouldRetry: (error: any) => boolean;
  onRetry: (attempt: number, delay: number, error: any) => void;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  monitoringPeriod?: number;
}

export interface CircuitBreakerStatus {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  nextAttemptTime: number | null;
}

export type ChannelName = 'email' | 'sms' | 'voice';
export type ErrorType = 'VALIDATION' | 'RATE_LIMIT' | 'PROVIDER' | 'NETWORK' | 'CONFIGURATION' | 'UNKNOWN';
