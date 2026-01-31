import { logger } from '../utils/logger.js';
import { getGrafanaConfig } from '../config/env.js';
import { GrafanaReport, ReportAssignment } from '../types/index.js';
import { GrafanaError } from '../utils/errors.js';
import { getCache, setCache, CacheKeys } from '../utils/cache.js';
import { recordCacheHit, recordCacheMiss } from '../utils/metrics.js';
import { createHttpClient, frappeClient } from '../utils/httpClient.js';
import { getGrafanaAuthToken } from '../utils/grafanaAuth.js';

/**
 * Get all available Grafana reports/dashboards with pagination
 */
export async function getAvailableReports(page: number = 1, limit: number = 50): Promise<{
  reports: GrafanaReport[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}> {
  try {
    // Check cache first (cache key includes pagination params)
    const cacheKey = `${CacheKeys.grafanaReports()}_page_${page}_limit_${limit}`;
    const cached = await getCache<{ reports: GrafanaReport[]; total: number }>(cacheKey);
    if (cached) {
      recordCacheHit('grafana_reports');
      return {
        ...cached,
        page,
        limit,
        hasMore: (page * limit) < cached.total
      };
    }
    recordCacheMiss('grafana_reports');

    const config = getGrafanaConfig();
    const authToken = await getGrafanaAuthToken();

    const client = createHttpClient(config.url);
    // Fetch all dashboards (Grafana doesn't support pagination in search API)
    const response = await client.get(
      `/api/search?type=dash-db&limit=1000`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );

    const allDashboards = response.data || [];

    const allReports = allDashboards.map((dashboard: any) => ({
      id: dashboard.id,
      uid: dashboard.uid,
      title: dashboard.title,
      url: dashboard.url,
      folderTitle: dashboard.folderTitle,
      folderUid: dashboard.folderUid
    }));

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedReports = allReports.slice(startIndex, endIndex);

    const result = {
      reports: paginatedReports,
      total: allReports.length,
      page,
      limit,
      hasMore: endIndex < allReports.length
    };

    // Cache for 5 minutes
    await setCache(cacheKey, { reports: paginatedReports, total: allReports.length }, 300);

    return result;
  } catch (error) {
    logger.error('Error fetching Grafana reports', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new GrafanaError('Failed to fetch reports from Grafana');
  }
}

/**
 * Get user reports (assigned via Frappe)
 */
export async function getUserReports(frappeUser: string): Promise<ReportAssignment[]> {
  try {
    // Check cache first
    const cacheKey = CacheKeys.userReports(frappeUser);
    const cached = await getCache<ReportAssignment[]>(cacheKey);
    if (cached) {
      recordCacheHit('user_reports');
      return cached;
    }
    recordCacheMiss('user_reports');

    const frappeUrl = process.env.FRAPPE_URL || 'http://localhost:8000';
    const response = await frappeClient.get(
      `${frappeUrl}/api/method/megatechtrackers.api.permissions.get_user_reports`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${process.env.FRAPPE_API_KEY}:${process.env.FRAPPE_API_SECRET}`
        },
        params: {
          user: frappeUser
        }
      }
    );

    const reports = response.data.message || [];
    
    // Cache for 5 minutes
    await setCache(cacheKey, reports, 300);

    return reports;
  } catch (error) {
    logger.error('Error fetching user reports from Frappe', {
      error: error instanceof Error ? error.message : String(error),
      frappeUser
    });
    throw new GrafanaError('Failed to fetch user reports');
  }
}

