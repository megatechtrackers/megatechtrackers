/**
 * Environment variable validation and configuration
 */
import { z } from 'zod';
import { GrafanaConfig, FrappeConfig, ServerConfig } from '../types/index.js';

const envSchema = z.object({
  // Grafana Configuration
  GRAFANA_URL: z.string().url(),
  // Browser-facing Grafana base URL for embeds (often Nginx on host port 3000)
  GRAFANA_PUBLIC_URL: z.string().url().optional(),
  GRAFANA_API_KEY: z.string().optional(),
  GRAFANA_USER: z.string().optional(),
  GRAFANA_PASSWORD: z.string().optional(),
  GRAFANA_ORG_ID: z.string().default('1'),

  // Frappe Configuration
  FRAPPE_URL: z.string().url(),
  FRAPPE_API_KEY: z.string().min(1),
  FRAPPE_API_SECRET: z.string().min(1),

  // Server Configuration
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3001'),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  // Version
  APP_VERSION: z.string().default('1.0.0'),

  // Redis (optional)
  REDIS_URL: z.string().url().optional(),

  // Sentry (optional)
  SENTRY_DSN: z.string().url().optional(),
});

type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function validateEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map((err: { path: (string | number)[]; message: string }) => 
      `${err.path.join('.')}: ${err.message}`
    ).join('\n');
    
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  // Validate Grafana auth
  if (!result.data.GRAFANA_API_KEY && (!result.data.GRAFANA_USER || !result.data.GRAFANA_PASSWORD)) {
    throw new Error('Either GRAFANA_API_KEY or both GRAFANA_USER and GRAFANA_PASSWORD must be set');
  }

  validatedEnv = result.data;
  return validatedEnv;
}

export function getGrafanaConfig(): GrafanaConfig {
  const env = validateEnv();
  return {
    url: env.GRAFANA_URL,
    publicUrl: env.GRAFANA_PUBLIC_URL || env.GRAFANA_URL,
    apiKey: env.GRAFANA_API_KEY,
    user: env.GRAFANA_USER,
    password: env.GRAFANA_PASSWORD,
    orgId: env.GRAFANA_ORG_ID,
  };
}

export function getFrappeConfig(): FrappeConfig {
  const env = validateEnv();
  return {
    url: env.FRAPPE_URL,
    apiKey: env.FRAPPE_API_KEY,
    apiSecret: env.FRAPPE_API_SECRET,
  };
}

export function getServerConfig(): ServerConfig {
  const env = validateEnv();
  return {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim()),
  };
}

export function getAppVersion(): string {
  const env = validateEnv();
  return env.APP_VERSION;
}
