/**
 * HTTP client with connection pooling and optimization
 */
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
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

/**
 * Create an axios instance with connection pooling
 */
export function createHttpClient(baseURL?: string, config?: AxiosRequestConfig): AxiosInstance {
  return axios.create({
    baseURL,
    httpAgent,
    httpsAgent,
    timeout: 30000,
    ...config,
  });
}

/**
 * Default HTTP client instances
 */
export const grafanaClient = createHttpClient();
export const frappeClient = createHttpClient();

