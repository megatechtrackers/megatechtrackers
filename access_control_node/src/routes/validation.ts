import express, { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { getCache } from '../utils/cache.js';

const router = express.Router();

interface TokenData {
  dashboardUid: string;
  userId: string;
  expiresAt: number;
  filters?: Record<string, any>;
}

/**
 * @swagger
 * /api/validate-embed-token:
 *   get:
 *     summary: Validate embed token (Nginx auth/proxy)
 *     description: Validates a time-limited embed token stored in Redis. Used by Nginx before proxying Grafana dashboard requests.
 *     tags: [Validation]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Embed token from the dashboard URL querystring
 *     responses:
 *       200:
 *         description: Validation result (always 200; see `valid` flag)
 *         headers:
 *           X-Token-Valid:
 *             schema:
 *               type: string
 *             description: '1 if valid, otherwise 0'
 *           X-Token-User:
 *             schema:
 *               type: string
 *             description: Frappe user for the token (only when valid)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 userId:
 *                   type: string
 *                 dashboardUid:
 *                   type: string
 *                 expiresAt:
 *                   type: integer
 *                 error:
 *                   type: string
 * GET /api/validate-embed-token
 * 
 * Validates embed token for Nginx auth_request
 * Called by Nginx before forwarding requests to Grafana
 */
router.get('/validate-embed-token', async (req: Request, res: Response): Promise<void> => {
  // Get token from query params (should be available from original request)
  const token = req.query.token as string;
  
  // Always log validation requests
  logger.info('Token validation request received', {
    token: token ? token.substring(0, 8) + '...' : 'missing',
    query: req.query,
    headers: Object.keys(req.headers)
  });

  if (!token) {
    res.setHeader('X-Token-Valid', '0');
    res.status(200).json({ valid: false, error: 'Token missing' });
    return;
  }

  try {
    // Check Redis for token
    const tokenData = await getCache<TokenData>(`embed_token:${token}`);

    if (!tokenData) {
      logger.warn('Token not found in Redis', { token: token.substring(0, 8) + '...' });
      res.setHeader('X-Token-Valid', '0');
      res.status(200).json({ valid: false, error: 'Token not found or expired' });
      return;
    }

    // Validate expiration
    const now = Math.floor(Date.now() / 1000);
    if (now > tokenData.expiresAt) {
      logger.warn('Token expired', {
        token: token.substring(0, 8) + '...',
        expiresAt: new Date(tokenData.expiresAt * 1000).toISOString()
      });
      res.setHeader('X-Token-Valid', '0');
      res.status(200).json({ valid: false, error: 'Token expired' });
      return;
    }

    // Token is valid (skip UID check since Nginx can't pass it reliably)
    logger.info('Token validated successfully', {
      token: token.substring(0, 8) + '...',
      userId: tokenData.userId,
      dashboardUid: tokenData.dashboardUid
    });

    res.setHeader('X-Token-Valid', '1');
    res.setHeader('X-Token-User', tokenData.userId);
    res.json({ 
      valid: true,
      userId: tokenData.userId,
      dashboardUid: tokenData.dashboardUid,
      expiresAt: tokenData.expiresAt
    });

  } catch (error) {
    logger.error('Token validation error', {
      error: error instanceof Error ? error.message : String(error),
      token: token ? token.substring(0, 8) + '...' : 'missing'
    });
    res.setHeader('X-Token-Valid', '0');
    res.status(200).json({ valid: false, error: 'Validation failed' });
  }
});

export { router as validationRouter };
