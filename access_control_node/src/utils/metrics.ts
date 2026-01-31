/**
 * Prometheus metrics collection
 */
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { logger } from './logger.js';

// Create a Registry to register the metrics
export const register = new Registry();

// Collect default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const embedUrlGenerationTotal = new Counter({
  name: 'embed_url_generation_total',
  help: 'Total number of embed URL generations',
  labelNames: ['status', 'user'],
  registers: [register],
});

export const embedUrlGenerationDuration = new Histogram({
  name: 'embed_url_generation_duration_seconds',
  help: 'Duration of embed URL generation in seconds',
  labelNames: ['status'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register],
});

export const errorTotal = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'route'],
  registers: [register],
});

// Register all custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(embedUrlGenerationTotal);
register.registerMetric(embedUrlGenerationDuration);
register.registerMetric(cacheHits);
register.registerMetric(cacheMisses);
register.registerMetric(activeConnections);
register.registerMetric(errorTotal);

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  duration: number
): void {
  httpRequestTotal.inc({ method, route, status_code: statusCode });
  httpRequestDuration.observe({ method, route, status_code: String(statusCode) }, duration);
}

/**
 * Record embed URL generation metrics
 */
export function recordEmbedUrlGeneration(
  status: 'success' | 'error',
  user: string,
  duration: number
): void {
  embedUrlGenerationTotal.inc({ status, user });
  embedUrlGenerationDuration.observe({ status }, duration);
}

/**
 * Record cache hit
 */
export function recordCacheHit(cacheType: string): void {
  cacheHits.inc({ cache_type: cacheType });
}

/**
 * Record cache miss
 */
export function recordCacheMiss(cacheType: string): void {
  cacheMisses.inc({ cache_type: cacheType });
}

/**
 * Record error
 */
export function recordError(errorType: string, route: string): void {
  errorTotal.inc({ error_type: errorType, route });
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

logger.info('Prometheus metrics initialized');

