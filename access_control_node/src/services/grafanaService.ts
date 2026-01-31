import { logger } from '../utils/logger.js';
import { validateFilters } from '../utils/filterValidator.js';
import { getUserContext } from '../utils/frappeClient.js';
import { getGrafanaConfig } from '../config/env.js';
import { GrafanaError, AuthorizationError } from '../utils/errors.js';
import { UserContext } from '../types/index.js';
import { getCache, setCache, CacheKeys } from '../utils/cache.js';
import { recordEmbedUrlGeneration, recordCacheHit, recordCacheMiss } from '../utils/metrics.js';
import { createHttpClient, frappeClient } from '../utils/httpClient.js';
import { getGrafanaAuthToken } from '../utils/grafanaAuth.js';
import crypto from 'crypto';

interface TokenData {
  dashboardUid: string;
  userId: string;
  expiresAt: number;
  filters?: Record<string, any>;
}

interface GenerateEmbedUrlParams {
  reportId: number;
  reportUid?: string;
  filters?: Record<string, string | string[]>;
  frappeUser: string;
  clientIp: string;
}

/**
 * Generate authenticated Grafana embed URL with locked filters
 */
export async function generateEmbedUrl({
  reportId,
  reportUid,
  filters = {},
  frappeUser,
  clientIp: _clientIp
}: GenerateEmbedUrlParams): Promise<string> {
  const startTime = Date.now();
  
  try {
    const hasDuplicateDashboardPath = (url: string): boolean => {
      try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        // Expect: ["d", "<uid>"] or ["d", "<uid>", "<slug>"]
        if (parts.length >= 3 && parts[0] === 'd') {
          return parts[1] === parts[2]; // true duplicates only: /d/uid/uid
        }
        return false;
      } catch {
        // If it's not a valid URL, be conservative and don't treat as duplicate
        return false;
      }
    };

    // Check cache first (cache key includes filters hash for uniqueness)
    const cacheKey = CacheKeys.embedUrl(frappeUser, reportId);
    const cachedUrl = await getCache<string>(cacheKey);
    if (cachedUrl) {
      // Validate cached URL doesn't have duplicate UID segments.
      // Only treat /d/<uid>/<uid> as invalid. Grafana may legitimately use /d/<uid>/<slug>.
      if (!hasDuplicateDashboardPath(cachedUrl)) {
        recordCacheHit('embed_url');
        return cachedUrl;
      } else {
        // Cached URL has duplicates - clear it and regenerate
        logger.warn('Cached URL has duplicate path segments, regenerating', { 
          cachedUrl: cachedUrl.substring(0, 100),
          pattern: '/d/<uid>/<uid>'
        });
      }
    }
    recordCacheMiss('embed_url');

    // Validate user has access to this report
    const hasAccess = await validateUserAccess(frappeUser, reportId);
    if (!hasAccess) {
      const duration = (Date.now() - startTime) / 1000;
      recordEmbedUrlGeneration('error', frappeUser, duration);
      throw new AuthorizationError(`User ${frappeUser} does not have access to report ${reportId}`);
    }

    // Get user context from Frappe (with caching)
    const contextCacheKey = CacheKeys.userContext(frappeUser);
    let userContext = await getCache<UserContext>(contextCacheKey);
    if (!userContext) {
      userContext = await getUserContext(frappeUser);
      await setCache(contextCacheKey, userContext, 300); // Cache for 5 minutes
    }


    // Pre-populate filters from user context if not provided
    // This ensures filters are automatically applied based on user assignments
    const filtersWithDefaults: Record<string, string | string[]> = { ...filters };
    
    // Auto-apply filters from user context if not already specified
    if (!filtersWithDefaults.vehicle && userContext.vehicles && userContext.vehicles.length === 1) {
      filtersWithDefaults.vehicle = userContext.vehicles[0];
    }
    if (!filtersWithDefaults.company && userContext.companies && userContext.companies.length === 1) {
      filtersWithDefaults.company = userContext.companies[0];
    }
    if (!filtersWithDefaults.department && userContext.departments && userContext.departments.length === 1) {
      filtersWithDefaults.department = userContext.departments[0];
    }

    // Merge and validate filters
    const validatedFilters = validateFilters(filtersWithDefaults, userContext, frappeUser);

    // Get Grafana authentication token
    const authToken = await getGrafanaAuthToken();

    // Get dashboard UID if not provided
    let finalReportUid = reportUid;
    if (!finalReportUid) {
      finalReportUid = await getDashboardUid(reportId, authToken);
    }
    
    // Clean the UID - remove any path segments (e.g., "/d/", "/dashboard/", etc.)
    // Grafana UIDs should be just the identifier, not a full path
    finalReportUid = cleanDashboardUid(finalReportUid);
    
    // Generate time-limited token for embed URL
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour expiration
    
    // Store token in Redis with expiration
    const tokenData: TokenData = {
      dashboardUid: finalReportUid,
      userId: frappeUser,
      expiresAt,
      filters: validatedFilters
    };
    
    const tokenKey = `embed_token:${token}`;
    
    // Ensure Redis is connected before storing token
    const { initRedis } = await import('../utils/cache.js');
    await initRedis();
    
    // Store token - log error if it fails
    try {
      await setCache(tokenKey, tokenData, 3600);
      logger.info('Token stored in Redis', {
        token: token.substring(0, 8) + '...',
        tokenKey,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        dashboardUid: finalReportUid
      });
    } catch (error) {
      logger.error('Failed to store token in Redis', {
        error: error instanceof Error ? error.message : String(error),
        token: token.substring(0, 8) + '...',
        tokenKey,
        stack: error instanceof Error ? error.stack : undefined
      });
      // Don't continue - token must be stored for validation to work
      throw new GrafanaError('Failed to store embed token - Redis may not be available');
    }
    
    const embedUrl = buildEmbedUrl({
      reportUid: finalReportUid,
      authToken,
      filters: validatedFilters,
      token
    });

    // Cache the embed URL (shorter TTL since it contains auth token)
    await setCache(cacheKey, embedUrl, 60); // Cache for 1 minute

    const duration = (Date.now() - startTime) / 1000;
    recordEmbedUrlGeneration('success', frappeUser, duration);

    logger.info('Generated embed URL', {
      reportId,
      reportUid: finalReportUid,
      originalReportUid: reportUid, // Log original for debugging
      frappeUser,
      filters: Object.keys(validatedFilters),
      filterValues: Object.entries(validatedFilters).reduce((acc, [key, value]) => {
        acc[key] = Array.isArray(value) ? value.length : value;
        return acc;
      }, {} as Record<string, any>),
      embedUrlPreview: embedUrl.substring(0, 100) + '...' // Log first 100 chars of URL
    });

    return embedUrl;
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    recordEmbedUrlGeneration('error', frappeUser, duration);
    
    logger.error('Error generating embed URL', {
      error: error instanceof Error ? error.message : String(error),
      reportId,
      frappeUser
    });
    throw error;
  }
}


/**
 * Clean dashboard UID - remove any path segments
 * Handles cases where UID might contain "/d/", "/dashboard/", or duplicate segments
 * 
 * Examples:
 * - "/d/report-analytics" -> "report-analytics"
 * - "/d/report-analytics/report-analytics" -> "report-analytics"
 * - "report-analytics/report-analytics" -> "report-analytics"
 * - "d/report-analytics" -> "report-analytics"
 */
function cleanDashboardUid(uid: string): string {
  if (!uid) return uid;
  
  const originalUid = uid;
  
  // Remove leading/trailing slashes and whitespace
  let cleaned = uid.trim().replace(/^\/+|\/+$/g, '');
  
  // Remove common path prefixes (case-insensitive)
  cleaned = cleaned.replace(/^(d|dashboard)\//i, '');
  
  // Split by slashes and filter out empty segments
  const segments = cleaned.split('/').filter(s => s.length > 0);
  
  if (segments.length === 0) {
    // If we have nothing left, return original (shouldn't happen, but safety check)
    logger.warn('cleanDashboardUid: No valid segments found', { originalUid, cleaned });
    return originalUid;
  }
  
  // Grafana dashboard URLs commonly look like:
  // - /d/<uid>                 (just uid)
  // - /d/<uid>/<slug>          (uid + human-friendly slug)
  // We always want the UID = FIRST segment after stripping "d/".
  cleaned = segments[0];
  if (segments.length > 1) {
    logger.info('cleanDashboardUid: Extracted UID from uid/slug path', {
      originalUid,
      cleaned,
      segments
    });
  }
  
  // Final validation - ensure it's a valid UID format (alphanumeric, hyphens, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
    logger.warn('cleanDashboardUid: UID contains invalid characters', { 
      originalUid, 
      cleaned 
    });
  }
  
  return cleaned;
}

/**
 * Get dashboard UID from dashboard ID
 */
async function getDashboardUid(dashboardId: number, authToken: string): Promise<string> {
  const config = getGrafanaConfig();
  
  try {
    const client = createHttpClient(config.url);
    const response = await client.get(
      `/api/dashboards/id/${dashboardId}`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );

    // Clean the UID from Grafana API to ensure no path segments or duplicates
    const rawUid = response.data.dashboard.uid;
    return cleanDashboardUid(rawUid);
  } catch (error) {
    logger.error('Error getting dashboard UID', {
      error: error instanceof Error ? error.message : String(error),
      dashboardId
    });
    throw new GrafanaError(`Failed to get dashboard UID for ID ${dashboardId}`);
  }
}

/**
 * Build embed URL with authentication and locked filters
 */
function buildEmbedUrl({
  reportUid,
  authToken: _authToken, // API token for Grafana API calls, not used in embed URL
  filters,
  token
}: {
  reportUid: string;
  authToken: string;
  filters: Record<string, string | string[]>;
  token: string;
}): string {
  const config = getGrafanaConfig();
  // Use browser-facing URL for embeds (usually Nginx on host port 3000)
  const baseUrl = `${config.publicUrl.replace(/\/$/, '')}/d/${reportUid}`;
  const params = new URLSearchParams();

  // Add token for Nginx validation
  params.append('token', token);

  // Add kiosk mode and org ID
  // kiosk=1 hides both the top navbar and the left sidebar (clean embed)
  params.append('kiosk', '1');
  params.append('orgId', config.orgId);

  // Add locked filters as URL variables
  // Grafana uses var-<variable_name>=<value> format
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      // Lock the variable (read-only)
      params.append(`var-${key}`, Array.isArray(value) ? value.join(',') : String(value));
      // Mark as locked (Grafana specific parameter)
      params.append(`var-${key}-locked`, 'true');
    }
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Validate user has access to report via Frappe
 */
async function validateUserAccess(frappeUser: string, reportId: number): Promise<boolean> {
  try {
    const frappeUrl = process.env.FRAPPE_URL || 'http://localhost:8000';
    const response = await frappeClient.post(
      `${frappeUrl}/api/method/megatechtrackers.api.permissions.validate_report_access`,
      {
        user: frappeUser,
        report_id: reportId
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${process.env.FRAPPE_API_KEY}:${process.env.FRAPPE_API_SECRET}`
        }
      }
    );

    return response.data.message?.has_access || false;
  } catch (error) {
    logger.error('Error validating user access', {
      error: error instanceof Error ? error.message : String(error),
      frappeUser,
      reportId
    });
    // Fail open - allow access if validation fails (can be made stricter)
    // This prevents blocking users if Frappe is temporarily unavailable
    return true;
  }
}
