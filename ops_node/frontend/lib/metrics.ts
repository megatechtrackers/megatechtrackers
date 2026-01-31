/**
 * Prometheus metrics for ops-service-frontend (Next.js).
 * Used by /api/metrics for scraping.
 */
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

const register = new Registry();
register.setDefaultLabels({ app: 'ops-service-frontend', job: 'ops-service-frontend' });

collectDefaultMetrics({ register, prefix: 'ops_frontend_' });

export const httpRequestsTotal = new Counter({
  name: 'ops_frontend_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'ops_frontend_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export async function getMetrics(): Promise<string> {
  return register.metrics();
}

export function getContentType(): string {
  return register.contentType;
}
