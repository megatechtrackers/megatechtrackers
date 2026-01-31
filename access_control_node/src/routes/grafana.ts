import express, { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { generateEmbedUrl } from '../services/grafanaService.js';
import { logger } from '../utils/logger.js';
import { auditLog } from '../utils/audit.js';
import { EmbedUrlRequest, EmbedUrlResponse } from '../types/index.js';
import { ValidationError as CustomValidationError } from '../utils/errors.js';
import { validateFrappeSession } from '../middleware/auth.js';
import { embedUrlRateLimiter } from '../middleware/rateLimit.js';
import { getCache, setCache, CacheKeys } from '../utils/cache.js';
import { recordCacheHit, recordCacheMiss } from '../utils/metrics.js';
import { getFrappeConfig } from '../config/env.js';

const router = express.Router();

/**
 * @swagger
 * /api/grafana/generate-embed-url:
 *   post:
 *     summary: Generate authenticated Grafana embed URL
 *     description: Generates an authenticated embed URL with locked filters based on user context
 *     tags: [Grafana]
 *     security:
 *       - FrappeUser: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmbedUrlRequest'
 *     responses:
 *       200:
 *         description: Embed URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmbedUrlResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: User does not have access to this report
 *       500:
 *         description: Internal server error
 */
/**
 * POST /api/grafana/generate-embed-url
 * Generate authenticated Grafana embed URL with locked filters
 * Rate limited: 50 requests per 15 minutes per user
 * Requires Frappe session authentication
 */
router.post(
  '/generate-embed-url',
  validateFrappeSession,
  embedUrlRateLimiter,
  [
    body('reportId').isInt().withMessage('reportId must be an integer'),
    body('reportUid').optional().isString(),
    body('filters').optional().isObject(),
    body('frappeUser').isString().withMessage('frappeUser is required'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const validationErrors = errors.array().map(err => ({
          msg: err.msg,
          param: err.type === 'field' ? err.path : 'unknown',
          value: err.type === 'field' ? (err as any).value : undefined
        }));
        throw new CustomValidationError('Validation failed', validationErrors);
      }

      const { reportId, reportUid, filters = {}, frappeUser } = req.body as EmbedUrlRequest;
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

      logger.info('Generating embed URL', {
        reportId,
        reportUid,
        frappeUser,
        clientIp,
        requestId: (req as any).requestId
      });

      // Generate embed URL with authentication and locked filters
      const embedUrl = await generateEmbedUrl({
        reportId,
        reportUid,
        filters: filters || {},
        frappeUser,
        clientIp
      });

      // Audit log
      await auditLog({
        action: 'generate_embed_url',
        user: frappeUser,
        reportId,
        reportUid,
        clientIp,
        success: true
      });

      const response: EmbedUrlResponse = {
        success: true,
        embedUrl,
        expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour expiry
      };

      res.json(response);
    } catch (error) {
      logger.error('Error generating embed URL', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        frappeUser: req.body?.frappeUser,
        requestId: (req as any).requestId
      });

      // Audit log failure
      await auditLog({
        action: 'generate_embed_url',
        user: req.body?.frappeUser || 'unknown',
        reportId: req.body?.reportId,
        clientIp: req.ip || 'unknown',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/grafana/validate-access:
 *   get:
 *     summary: Validate report access
 *     description: Validate if user has access to a specific report
 *     tags: [Grafana]
 *     security:
 *       - FrappeUser: []
 *     parameters:
 *       - in: query
 *         name: reportId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Grafana dashboard ID
 *     responses:
 *       200:
 *         description: Access validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasAccess:
 *                   type: boolean
 *                 reportId:
 *                   type: integer
 *       400:
 *         description: Missing reportId parameter
 *       401:
 *         description: Authentication required
 */
/**
 * GET /api/grafana/validate-access
 * Validate if user has access to a report
 */
router.get(
  '/validate-access',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reportId } = req.query;
      const frappeUser = (req as any).frappeUser;

      if (!reportId) {
        return res.status(400).json({ error: 'reportId is required' });
      }

      // Validate access via Frappe API
      const hasAccess = await validateReportAccess(frappeUser, reportId as string);

      return res.json({
        hasAccess,
        reportId: parseInt(reportId as string)
      });
    } catch (error) {
      logger.error('Error validating access', {
        error: error instanceof Error ? error.message : String(error),
        frappeUser: (req as any).frappeUser,
        requestId: (req as any).requestId
      });
      return next(error);
    }
  }
);

async function validateReportAccess(frappeUser: string, reportId: string): Promise<boolean> {
  try {
    // Check cache first
    const cacheKey = CacheKeys.reportAccess(frappeUser, reportId);
    const cached = await getCache<boolean>(cacheKey);
    if (cached !== null) {
      recordCacheHit('report_access');
      return cached;
    }
    recordCacheMiss('report_access');

    // Validate with Frappe
    const config = getFrappeConfig();
    const response = await fetch(
      `${config.url}/api/method/megatechtrackers.api.permissions.validate_report_access`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${config.apiKey}:${config.apiSecret}`
        },
        body: JSON.stringify({
          user: frappeUser,
          report_id: reportId
        })
      }
    );

    let hasAccess = false;
    if (response.ok) {
      const data = await response.json() as { message?: { has_access?: boolean } };
      hasAccess = data.message?.has_access || false;
    } else {
      logger.warn('Report access validation failed', {
        status: response.status,
        frappeUser,
        reportId
      });
      // Fail open - allow access if validation fails (can be made stricter)
      hasAccess = true;
    }

    // Cache result for 10 minutes
    await setCache(cacheKey, hasAccess, 600).catch(err => {
      logger.warn('Failed to cache report access validation', {
        error: err instanceof Error ? err.message : String(err),
        frappeUser,
        reportId
      });
    });

    return hasAccess;
  } catch (error) {
    logger.error('Error validating report access via Frappe', { 
      error: error instanceof Error ? error.message : String(error),
      frappeUser,
      reportId
    });
    // Fail open - allow access if validation fails (can be made stricter)
    return true;
  }
}

/**
 * GET /api/grafana/proxy/d/*
 * Proxy dashboard requests with token validation
 */
router.get('/proxy/d/*', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.query.token as string;
    const dashboardPath = req.path.replace('/proxy', ''); // Remove /proxy prefix
    
    logger.info('Dashboard proxy request', {
      path: dashboardPath,
      token: token ? token.substring(0, 8) + '...' : 'missing',
      query: req.query
    });

    if (!token) {
      res.status(403).json({ error: 'Token required' });
      return;
    }

    // Validate token
    const { getCache } = await import('../utils/cache.js');
    const tokenData = await getCache<{
      dashboardUid: string;
      userId: string;
      expiresAt: number;
      filters?: Record<string, any>;
    }>(`embed_token:${token}`);

    if (!tokenData) {
      logger.warn('Invalid token for dashboard proxy', { token: token.substring(0, 8) + '...' });
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (now > tokenData.expiresAt) {
      logger.warn('Expired token for dashboard proxy', { 
        token: token.substring(0, 8) + '...',
        expiresAt: new Date(tokenData.expiresAt * 1000).toISOString()
      });
      res.status(403).json({ error: 'Token expired' });
      return;
    }

    // Token is valid - proxy to Grafana container
    // IMPORTANT: this route often runs inside a Docker container.
    // Never use localhost here (it would point to THIS container).
    // Use the configured Grafana base URL (e.g. http://grafana:3000 in docker-compose).
    const grafanaUrl = (process.env.GRAFANA_URL || 'http://grafana:3000').replace(/\/$/, '');
    const fullPath = dashboardPath + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
    const targetUrl = `${grafanaUrl}${fullPath}`;
    
    logger.info('Proxying to Grafana', { 
      targetUrl: targetUrl.substring(0, 100) + '...',
      userId: tokenData.userId 
    });

    // Proxy the request to Grafana
    const axios = (await import('axios')).default;
    const proxyResponse = await axios.get(targetUrl, {
      headers: {
        'Host': req.headers.host,
        'User-Agent': req.headers['user-agent'] || 'Access-Gateway-Proxy'
      },
      responseType: 'stream',
      validateStatus: () => true // Accept any status code
    });

    // Forward status and headers (except frame-blocking headers for embedding)
    res.status(proxyResponse.status);
    
    // Log all headers from Grafana for debugging
    logger.debug('Headers from Grafana', { 
      headers: Object.keys(proxyResponse.headers),
      hasXFrameOptions: !!proxyResponse.headers['x-frame-options'],
      hasCSP: !!proxyResponse.headers['content-security-policy']
    });
    
    const skippedHeaders: string[] = [];
    Object.entries(proxyResponse.headers).forEach(([key, value]) => {
      // Skip headers that prevent iframe embedding
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'x-frame-options' || lowerKey === 'content-security-policy') {
        skippedHeaders.push(key);
        return;
      }
      res.setHeader(key, value as string);
    });
    
    if (skippedHeaders.length > 0) {
      logger.info('Stripped frame-blocking headers', { skippedHeaders });
    }

    // Pipe response
    proxyResponse.data.pipe(res);

  } catch (error) {
    logger.error('Dashboard proxy error', {
      error: error instanceof Error ? error.message : String(error),
      path: req.path
    });
    res.status(500).json({ error: 'Proxy error' });
  }
});

export { router as grafanaRouter };

