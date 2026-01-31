import { ErrorType } from '../types';

/**
 * Comprehensive Error Taxonomy
 * 
 * Error categories:
 * - VALIDATION: Invalid input, missing required fields, format errors (non-retryable)
 * - RATE_LIMIT: Rate limiting, throttling (retryable with backoff)
 * - PROVIDER: Provider API errors (5xx retryable, 4xx non-retryable)
 * - NETWORK: Network connectivity issues (retryable)
 * - CONFIGURATION: Configuration errors, missing credentials (non-retryable)
 * - UNKNOWN: Unexpected errors (retryable by default)
 */

export class ChannelError extends Error {
  type: ErrorType;
  retryable: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;  // More specific category within the type
  context?: Record<string, any>;  // Additional context for debugging

  constructor(
    message: string, 
    type: ErrorType, 
    retryable: boolean,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    category: string = 'general',
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ChannelError';
    this.type = type;
    this.retryable = retryable;
    this.severity = severity;
    this.category = category;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Get error classification for metrics and alerting
   */
  getClassification(): {
    type: ErrorType;
    retryable: boolean;
    severity: string;
    category: string;
  } {
    return {
      type: this.type,
      retryable: this.retryable,
      severity: this.severity,
      category: this.category
    };
  }
}

export class ValidationError extends ChannelError {
  field?: string;
  value?: any;

  constructor(message: string, field?: string, value?: any) {
    super(
      message, 
      'VALIDATION', 
      false,
      'medium',
      field ? `field_${field}` : 'general',
      field ? { field, value } : undefined
    );
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

export class RateLimitError extends ChannelError {
  retryAfter?: number;
  limitType?: 'per_minute' | 'per_hour' | 'per_day' | 'global';

  constructor(
    message: string, 
    retryAfter?: number,
    limitType?: 'per_minute' | 'per_hour' | 'per_day' | 'global'
  ) {
    super(
      message, 
      'RATE_LIMIT', 
      true,
      'high',
      limitType || 'general',
      { retryAfter, limitType }
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.limitType = limitType;
  }
}

export class ProviderError extends ChannelError {
  statusCode: number;
  providerCode?: string;
  providerMessage?: string;

  constructor(
    message: string, 
    statusCode: number,
    providerCode?: string,
    providerMessage?: string
  ) {
    const isRetryable = statusCode >= 500 || statusCode === 429;
    const severity = statusCode >= 500 ? 'high' : statusCode >= 400 ? 'medium' : 'low';
    const category = statusCode >= 500 ? 'server_error' : 
                     statusCode === 429 ? 'rate_limit' :
                     statusCode === 401 ? 'authentication' :
                     statusCode === 403 ? 'authorization' :
                     statusCode === 404 ? 'not_found' :
                     'client_error';

    super(
      message, 
      'PROVIDER', 
      isRetryable,
      severity,
      category,
      { statusCode, providerCode, providerMessage }
    );
    this.name = 'ProviderError';
    this.statusCode = statusCode;
    this.providerCode = providerCode;
    this.providerMessage = providerMessage;
  }
}

export class NetworkError extends ChannelError {
  code?: string;
  hostname?: string;
  port?: number;

  constructor(
    message: string, 
    code?: string,
    hostname?: string,
    port?: number
  ) {
    const category = code === 'ETIMEDOUT' ? 'timeout' :
                     code === 'ECONNREFUSED' ? 'connection_refused' :
                     code === 'ENOTFOUND' ? 'dns_error' :
                     code === 'ECONNRESET' ? 'connection_reset' :
                     'network_error';

    super(
      message, 
      'NETWORK', 
      true,
      'high',
      category,
      { code, hostname, port }
    );
    this.name = 'NetworkError';
    this.code = code;
    this.hostname = hostname;
    this.port = port;
  }
}

export class ConfigurationError extends ChannelError {
  configKey?: string;

  constructor(message: string, configKey?: string) {
    super(
      message, 
      'CONFIGURATION', 
      false,
      'critical',
      configKey ? `missing_${configKey}` : 'general',
      { configKey }
    );
    this.name = 'ConfigurationError';
    this.configKey = configKey;
  }
}

/**
 * Helper function to classify unknown errors
 */
export function classifyError(error: any): ChannelError {
  if (error instanceof ChannelError) {
    return error;
  }

  // Network errors
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || 
      error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
    return new NetworkError(
      error.message || 'Network error',
      error.code,
      error.hostname,
      error.port
    );
  }

  // HTTP errors
  if (error.response) {
    const status = error.response.status;
    return new ProviderError(
      error.message || `HTTP ${status}`,
      status,
      error.response.data?.code,
      error.response.data?.message
    );
  }

  // Rate limit errors
  if (error.status === 429 || error.response?.status === 429) {
    return new RateLimitError(
      error.message || 'Rate limit exceeded',
      error.response?.headers?.['retry-after'],
      'per_minute'
    );
  }

  // Default to unknown error
  return new ChannelError(
    error.message || 'Unknown error',
    'UNKNOWN',
    true,  // Retry unknown errors by default
    'medium',
    'unclassified',
    { originalError: error.toString() }
  );
}
