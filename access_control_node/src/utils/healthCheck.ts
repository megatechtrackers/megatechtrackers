/**
 * Health check utilities
 */
import axios from 'axios';
import { getGrafanaConfig, getFrappeConfig } from '../config/env.js';
import { HealthCheckResponse } from '../types/index.js';
import { getAppVersion } from '../config/env.js';

export async function performHealthCheck(): Promise<HealthCheckResponse> {
  const grafanaConfig = getGrafanaConfig();
  const frappeConfig = getFrappeConfig();
  
  const services: {
    grafana: 'ok' | 'error';
    frappe: 'ok' | 'error';
  } = {
    grafana: 'ok',
    frappe: 'ok',
  };

  // Check Grafana
  try {
    const authHeader = grafanaConfig.apiKey 
      ? { 'Authorization': `Bearer ${grafanaConfig.apiKey}` }
      : {};
    
    await axios.get(`${grafanaConfig.url}/api/health`, {
      headers: authHeader,
      timeout: 5000,
    });
  } catch (error) {
    services.grafana = 'error';
  }

  // Check Frappe
  try {
    await axios.get(`${frappeConfig.url}/api/method/ping`, {
      timeout: 5000,
    });
  } catch (error) {
    services.frappe = 'error';
  }

  const status = services.grafana === 'ok' && services.frappe === 'ok' 
    ? 'ok' 
    : services.grafana === 'error' && services.frappe === 'error'
    ? 'down'
    : 'degraded';

  return {
    status,
    timestamp: new Date().toISOString(),
    version: getAppVersion(),
    services,
  };
}
