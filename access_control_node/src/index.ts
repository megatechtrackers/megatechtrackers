// Load environment variables from .env file (must be first)
import 'dotenv/config';

import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { grafanaRouter } from './routes/grafana.js';
import { reportsRouter } from './routes/reports.js';
import { swaggerRouter } from './routes/swagger.js';
import { validationRouter } from './routes/validation.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { validateFrappeSession } from './middleware/auth.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { compressionMiddleware } from './middleware/compression.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { generalRateLimiter, apiRateLimiter } from './middleware/rateLimit.js';
import { validateEnv, getServerConfig } from './config/env.js';
import { performHealthCheck } from './utils/healthCheck.js';
import { gracefulShutdown } from './utils/shutdown.js';
import { initRedis, closeRedis } from './utils/cache.js';
import { initSentry, flushSentry } from './utils/sentry.js';
import { getMetrics } from './utils/metrics.js';

// Validate environment variables on startup
try {
  validateEnv();
} catch (error) {
  logger.error('Environment validation failed', { error });
  process.exit(1);
}

// Initialize Sentry
initSentry();

// Initialize Redis (non-blocking)
initRedis().catch(err => {
  logger.warn('Redis initialization failed, continuing without cache', { error: err });
});

const app: Express = express();
const config = getServerConfig();

function isAllowedOrigin(origin: string | undefined | null): boolean {
  // If there's no Origin header (curl, server-to-server), allow.
  if (!origin) return true;

  const allowed = config.allowedOrigins;

  // Exact match
  if (allowed.includes(origin)) return true;

  // Wildcard patterns like: "http://localhost:*"
  for (const pattern of allowed) {
    if (!pattern) continue;
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -1); // keep trailing ':'
      if (origin.startsWith(prefix)) return true;
    }
  }

  return false;
}

// Trust proxy for load balancing (X-Forwarded-For headers)
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: config.nodeEnv === 'production',
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: (origin: any, callback: any) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Frappe-User', 'X-Frappe-Session-Id', 'X-Request-ID'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID for correlation
app.use(requestIdMiddleware);

// Metrics collection
app.use(metricsMiddleware);

// Compression
app.use(compressionMiddleware());

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Check service health and dependencies
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 *       503:
 *         description: Service is degraded
 *       500:
 *         description: Service is down
 */
// Health check
app.get('/health', async (_req: any, res: any) => {
  try {
    const health = await performHealthCheck();
    const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 503 : 500;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(500).json({
      status: 'down',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus metrics
 *     description: Get Prometheus metrics in text format
 *     tags: [Metrics]
 *     responses:
 *       200:
 *         description: Metrics in Prometheus format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
// Prometheus metrics endpoint
app.get('/metrics', async (_req: any, res: any) => {
  try {
    const metrics = await getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    logger.error('Error getting metrics', { error });
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Token validation endpoint (for Nginx auth_request) - no auth required, no rate limiting
// Must be before other /api routes to avoid auth middleware and rate limiting
// Mount at /api so the route /validate-embed-token becomes /api/validate-embed-token
app.use('/api', validationRouter);

// Rate limiting (applied to routes below, but not validation endpoint above)
app.use(generalRateLimiter);

// API routes with rate limiting and Frappe session auth
// Note: grafanaRouter includes both authenticated and proxy (token-based) endpoints
// The proxy endpoints check token internally and don't need Frappe session
app.use('/api/grafana', grafanaRouter);
app.use('/api/reports', validateFrappeSession, apiRateLimiter, reportsRouter);

// Swagger documentation (no auth required for docs)
app.use('/', swaggerRouter);

// Error handling (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  logger.info(`Access Gateway running on port ${config.port}`, {
    nodeEnv: config.nodeEnv,
    logLevel: config.logLevel,
  });
});

// Graceful shutdown
gracefulShutdown(server, logger, async () => {
  await closeRedis();
  await flushSentry();
});

export default app;
