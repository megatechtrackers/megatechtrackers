/**
 * HTTP client with connection pooling, retry logic, and resilience
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import https from 'https';
import http from 'http';

// Create optimized HTTP agents with connection pooling
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
});

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second base delay
const RETRYABLE_ERRORS = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN'];
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Check if error is retryable
 */
function isRetryableError(error: AxiosError): boolean {
  // Network errors
  if (error.code && RETRYABLE_ERRORS.includes(error.code)) {
    return true;
  }
  
  // Server errors
  if (error.response?.status && RETRYABLE_STATUS_CODES.includes(error.response.status)) {
    return true;
  }
  
  // Timeout
  if (error.message?.includes('timeout')) {
    return true;
  }
  
  return false;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create an axios instance with connection pooling and automatic retry
 */
export function createHttpClient(baseURL?: string, config?: AxiosRequestConfig): AxiosInstance {
  const client = axios.create({
    baseURL,
    httpAgent,
    httpsAgent,
    timeout: 30000,
    ...config,
  });
  
  // Add retry interceptor
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as AxiosRequestConfig & { _retryCount?: number };
      
      if (!config) {
        return Promise.reject(error);
      }
      
      config._retryCount = config._retryCount || 0;
      
      // Check if we should retry
      if (config._retryCount < MAX_RETRIES && isRetryableError(error)) {
        config._retryCount++;
        
        // Exponential backoff with jitter
        const delay = RETRY_DELAY_BASE * Math.pow(2, config._retryCount - 1) + Math.random() * 500;
        
        console.log(`HTTP retry ${config._retryCount}/${MAX_RETRIES} for ${config.url} after ${Math.round(delay)}ms (${error.code || error.message})`);
        
        await sleep(delay);
        
        return client.request(config);
      }
      
      return Promise.reject(error);
    }
  );
  
  return client;
}

/**
 * Default HTTP client instances with retry support
 */
export const grafanaClient = createHttpClient();
export const frappeClient = createHttpClient();

