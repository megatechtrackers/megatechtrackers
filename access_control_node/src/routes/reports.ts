import express, { Request, Response, NextFunction } from 'express';
import { getAvailableReports } from '../services/reportsService.js';
import { logger } from '../utils/logger.js';
import { ReportAssignment } from '../types/index.js';

const router = express.Router();

/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: Get all available Grafana reports
 *     description: Fetch all available reports from Grafana API
 *     tags: [Reports]
 *     security:
 *       - FrappeUser: []
 *     responses:
 *       200:
 *         description: List of available reports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 reports:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/GrafanaReport'
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
/**
 * GET /api/reports
 * Get all available Grafana reports with pagination
 * Query params: page (default: 1), limit (default: 50)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Max 100 per page

    const result = await getAvailableReports(page, limit);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error fetching reports', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      requestId: (req as any).requestId
    });
    next(error);
  }
});

/**
 * @swagger
 * /api/reports/user:
 *   get:
 *     summary: Get user-assigned reports
 *     description: Get reports assigned to the current Frappe user
 *     tags: [Reports]
 *     security:
 *       - FrappeUser: []
 *     responses:
 *       200:
 *         description: List of user-assigned reports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 reports:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ReportAssignment'
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
/**
 * GET /api/reports/user
 * Get reports assigned to the current Frappe user
 */
router.get('/user', async (req: Request, res: Response, next: NextFunction) => {
  try {
    
    // Fetch user reports from Frappe
    const frappeUrl = process.env.FRAPPE_URL || 'http://localhost:8000';
    const response = await fetch(
      `${frappeUrl}/api/method/megatechtrackers.api.permissions.get_user_reports`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${process.env.FRAPPE_API_KEY}:${process.env.FRAPPE_API_SECRET}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch user reports from Frappe');
    }

    const data = await response.json() as { message?: ReportAssignment[] };
    const userReports: ReportAssignment[] = data.message || [];

    res.json({
      success: true,
      reports: userReports
    });
  } catch (error) {
    logger.error('Error fetching user reports', {
      error: error instanceof Error ? error.message : String(error),
      frappeUser: (req as any).frappeUser,
      requestId: (req as any).requestId
    });
    next(error);
  }
});

export { router as reportsRouter };
