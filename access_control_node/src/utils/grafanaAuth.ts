import { logger } from './logger.js';
import { getGrafanaConfig } from '../config/env.js';
import { GrafanaError } from './errors.js';

/**
 * Get Grafana authentication token with caching and refresh
 * Handles token expiration and automatic refresh
 */
export async function getGrafanaAuthToken(): Promise<string> {
  const config = getGrafanaConfig();
  
  // If API key is configured, use it directly (no expiration)
  if (config.apiKey) {
    return config.apiKey;
  }

  // IMPORTANT:
  // We intentionally do NOT create Grafana API keys/service accounts here.
  // Provisioning must happen in the one-click docker-start scripts which write GRAFANA_API_KEY into root .env.
  logger.error('Grafana API key missing (GRAFANA_API_KEY). Refusing to auto-provision from service runtime.', {
    hasUser: !!config.user,
    hasPassword: !!config.password
  });
  throw new GrafanaError('Grafana API key not configured. Run docker-start to provision GRAFANA_API_KEY.');
}
