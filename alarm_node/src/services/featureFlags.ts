import logger from '../utils/logger';
import db from '../db';
import config from '../config';

/**
 * Feature Flags Service
 * 
 * Allows dynamic enable/disable of features without code deployment
 * Flags stored in database for persistence
 */

interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  updated_at?: Date;
}

class FeatureFlagsService {
  private flags: Map<string, boolean> = new Map();
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_INTERVAL_MS: number;

  constructor() {
    this.REFRESH_INTERVAL_MS = config.featureFlags.refreshInterval;
  }

  async initialize(): Promise<void> {
    await this.loadFlags();
    
    // Auto-refresh flags every minute
    this.refreshInterval = setInterval(() => {
      this.loadFlags().catch(error => {
        logger.error('Error refreshing feature flags:', error);
      });
    }, this.REFRESH_INTERVAL_MS);
    
    logger.info('Feature flags service initialized');
  }

  private async loadFlags(): Promise<void> {
    try {
      const query = 'SELECT name, enabled, description, updated_at FROM alarms_feature_flags';
      const result = await db.query(query);
      
      this.flags.clear();
      result.rows.forEach((row: FeatureFlag) => {
        this.flags.set(row.name, row.enabled);
      });
      
      logger.debug(`Loaded ${this.flags.size} feature flags`);
    } catch (error: any) {
      // If table doesn't exist, create default flags
      if (error.code === '42P01') {
        await this.createFlagsTable();
        await this.loadDefaultFlags();
      } else {
        logger.error('Error loading feature flags:', error);
      }
    }
  }

  private async createFlagsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS alarms_feature_flags (
        name VARCHAR(100) PRIMARY KEY,
        enabled BOOLEAN DEFAULT TRUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_alarms_feature_flags_enabled ON alarms_feature_flags(enabled);
    `;
    
    await db.query(query);
    logger.info('Created alarms_feature_flags table');
  }

  private async loadDefaultFlags(): Promise<void> {
    const defaultFlags = [
      { name: 'email_enabled', enabled: true, description: 'Enable email notifications' },
      { name: 'sms_enabled', enabled: true, description: 'Enable SMS notifications' },
      { name: 'voice_enabled', enabled: false, description: 'Enable voice call notifications' },
      { name: 'deduplication_enabled', enabled: true, description: 'Enable alarm deduplication' },
      { name: 'quiet_hours_enabled', enabled: true, description: 'Enable quiet hours filtering' },
      { name: 'rate_limiting_enabled', enabled: false, description: 'Enable Redis rate limiting' },
      { name: 'webhooks_enabled', enabled: true, description: 'Enable webhook handlers' },
      { name: 'listen_notify_enabled', enabled: true, description: 'Enable PostgreSQL LISTEN/NOTIFY for monitoring and metrics (alarm processing still uses RabbitMQ)' },
      { name: 'channel_fallback_enabled', enabled: true, description: 'Enable channel fallback (try next channel on failure)' }
    ];

    for (const flag of defaultFlags) {
      const query = `
        INSERT INTO alarms_feature_flags (name, enabled, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO NOTHING
      `;
      await db.query(query, [flag.name, flag.enabled, flag.description]);
    }

    logger.info('Loaded default feature flags');
    await this.loadFlags();
  }

  /**
   * Check if a feature is enabled
   */
  isEnabled(featureName: string): boolean {
    const enabled = this.flags.get(featureName);
    
    if (enabled === undefined) {
      logger.warn(`Feature flag not found: ${featureName}, defaulting to false`);
      return false;
    }
    
    return enabled;
  }

  /**
   * Enable a feature
   */
  async enable(featureName: string): Promise<void> {
    await this.setFlag(featureName, true);
  }

  /**
   * Disable a feature
   */
  async disable(featureName: string): Promise<void> {
    await this.setFlag(featureName, false);
  }

  private async setFlag(featureName: string, enabled: boolean): Promise<void> {
    const query = `
      UPDATE alarms_feature_flags
      SET enabled = $1, updated_at = NOW()
      WHERE name = $2
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [enabled, featureName]);
      
      if (result.rows.length > 0) {
        this.flags.set(featureName, enabled);
        logger.info(`Feature flag ${featureName} set to ${enabled}`);
      } else {
        logger.warn(`Feature flag not found: ${featureName}`);
      }
    } catch (error) {
      logger.error(`Error setting feature flag ${featureName}:`, error);
      throw error;
    }
  }

  /**
   * Get all feature flags
   */
  getAllFlags(): { [key: string]: boolean } {
    const allFlags: { [key: string]: boolean } = {};
    this.flags.forEach((value, key) => {
      allFlags[key] = value;
    });
    return allFlags;
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    logger.info('Feature flags service shut down');
  }
}

export default new FeatureFlagsService();
