/**
 * Shared TypeScript types and interfaces for Access Gateway
 */

export interface GrafanaConfig {
  url: string;
  /**
   * Public (browser-facing) Grafana base URL used for embed URLs.
   * In Docker dev, this should usually be the Nginx-exposed URL: http://localhost:3000
   */
  publicUrl: string;
  apiKey?: string;
  user?: string;
  password?: string;
  orgId: string;
}

export interface FrappeConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export interface ServerConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  allowedOrigins: string[];
}

export interface EmbedUrlRequest {
  reportId: number;
  reportUid?: string;
  filters?: Record<string, string | string[]>;
  frappeUser: string;
}

export interface EmbedUrlResponse {
  success: boolean;
  embedUrl: string;
  expiresAt: string;
}

export interface GrafanaReport {
  id: number;
  uid: string;
  title: string;
  url: string;
  folderTitle?: string;
  folderUid?: string;
}

export interface UserContext {
  vehicles: string[];
  companies: string[];
  departments: string[];
}

export interface ReportAssignment {
  id: number;
  uid?: string;
  name: string;
  context?: {
    vehicles?: string[];
    companies?: string[];
    departments?: string[];
  };
  inherited?: boolean;
  source?: string;
}

export interface FormAssignment {
  name: string;
  label: string;
  url: string;
  inherited?: boolean;
  source?: string;
}

export interface UserPermissions {
  forms: FormAssignment[];
  reports: ReportAssignment[];
  context: UserContext;
}

export interface AuditLogEntry {
  timestamp: string;
  action: string;
  user: string;
  reportId?: number;
  reportUid?: string;
  clientIp: string;
  success: boolean;
  error?: string;
}

export interface ApiError {
  error: string;
  message?: string;
  errors?: ValidationError[];
  statusCode?: number;
}

export interface ValidationError {
  msg: string;
  param: string;
  value?: unknown;
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  services: {
    grafana: 'ok' | 'error';
    frappe: 'ok' | 'error';
  };
}
