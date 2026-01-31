import logger from '../utils/logger';
import { encrypt, decrypt, isEncrypted } from '../utils/encryption';
import db from '../db';
import systemStateManager from './systemState';

/**
 * Configuration Service
 * Loads and caches channel configurations from database
 */

export interface ChannelConfig {
  [key: string]: string;
}

interface ConfigRow {
  id: number;
  channel_type: string;
  config_key: string;
  config_value: string;
  encrypted: boolean;
  is_mock: boolean;
  updated_at: Date;
}

class ConfigurationService {
  private cache: Map<string, ChannelConfig> = new Map();
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_INTERVAL_MS = 60000; // 1 minute

  /**
   * Initialize the configuration service
   */
  async initialize(): Promise<void> {
    try {
      // Load initial configurations
      await this.refreshAllConfigs();
      
      // Start periodic refresh
      this.refreshInterval = setInterval(async () => {
        try {
          await this.refreshAllConfigs();
        } catch (error: any) {
          logger.error('Failed to refresh configurations:', error);
        }
      }, this.REFRESH_INTERVAL_MS);
      
      logger.info('Configuration service initialized');
    } catch (error: any) {
      logger.error('Failed to initialize configuration service:', error);
      throw error;
    }
  }

  /**
   * Get cache key for a channel and mock mode
   */
  private getCacheKey(channel: string, isMock: boolean): string {
    return `${channel}:${isMock ? 'mock' : 'real'}`;
  }

  /**
   * Refresh all configurations from database
   */
  private async refreshAllConfigs(): Promise<void> {
    try {
      const result = await db.query(
        'SELECT * FROM alarms_channel_config'
      ) as { rows: ConfigRow[] };
      
      // Group by channel and mock mode
      const grouped: Map<string, ChannelConfig> = new Map();
      
      for (const row of result.rows) {
        const key = this.getCacheKey(row.channel_type, row.is_mock);
        
        if (!grouped.has(key)) {
          grouped.set(key, {});
        }
        
        const config = grouped.get(key)!;
        
        // Decrypt if necessary
        let value = row.config_value;
        if (row.encrypted && value && isEncrypted(value)) {
          try {
            value = decrypt(value);
          } catch (error: any) {
            logger.error(`Failed to decrypt ${row.channel_type}.${row.config_key}:`, error);
          }
        }
        
        config[row.config_key] = value;
      }
      
      this.cache = grouped;
      logger.debug(`Refreshed configurations for ${grouped.size} channel variants`);
    } catch (error: any) {
      logger.error('Failed to refresh configurations:', error);
      throw error;
    }
  }

  /**
   * Public method to reload cache (used by API)
   */
  async reloadCache(): Promise<void> {
    await this.refreshAllConfigs();
    logger.info('Configuration cache reloaded');
  }

  /**
   * Get configuration for a channel
   * Automatically uses mock or real based on system state
   */
  async getChannelConfig(channel: string): Promise<ChannelConfig> {
    const isMock = channel === 'sms' 
      ? systemStateManager.isMockMode('sms')
      : channel === 'email'
        ? systemStateManager.isMockMode('email')
        : false;
    
    return this.getChannelConfigByMode(channel, isMock);
  }

  /**
   * Get configuration for a channel with explicit mock mode
   */
  async getChannelConfigByMode(channel: string, isMock: boolean): Promise<ChannelConfig> {
    const key = this.getCacheKey(channel, isMock);
    const config = this.cache.get(key);
    
    if (!config) {
      logger.warn(`No configuration found for ${channel} (${isMock ? 'mock' : 'real'})`);
      
      // Fallback to environment variables
      return this.getConfigFromEnv(channel);
    }
    
    return { ...config }; // Return copy
  }

  /**
   * Fallback: Get configuration from environment variables
   */
  private getConfigFromEnv(channel: string): ChannelConfig {
    logger.info(`Using environment variables for ${channel} configuration`);
    
    if (channel === 'email') {
      return {
        smtp_host: process.env.EMAIL_HOST || 'localhost',
        smtp_port: process.env.EMAIL_PORT || '25',
        smtp_secure: process.env.EMAIL_SECURE || 'false',
        smtp_user: process.env.EMAIL_USER || '',
        smtp_password: process.env.EMAIL_PASSWORD || '',
        from_address: process.env.EMAIL_FROM || 'noreply@megatechtrackers.com',
      };
    }
    
    if (channel === 'sms') {
      return {
        api_url: process.env.SMS_API_URL || 'http://mock-sms-server:8086/sms/send',
        api_key: process.env.SMS_API_KEY || 'mock-api-key',
      };
    }
    
    return {};
  }

  /**
   * Set configuration for a channel
   */
  async setChannelConfig(
    channel: string, 
    config: ChannelConfig, 
    isMock: boolean = false,
    sensitiveKeys: string[] = []
  ): Promise<boolean> {
    try {
      // Delete existing config for this channel/mode
      await db.query(
        'DELETE FROM alarms_channel_config WHERE channel_type = $1 AND is_mock = $2',
        [channel, isMock]
      );
      
      // Insert new config
      for (const [key, value] of Object.entries(config)) {
        const isEncrypted = sensitiveKeys.includes(key);
        const finalValue = isEncrypted && value ? encrypt(value) : value;
        
        await db.query(
          `INSERT INTO alarms_channel_config 
           (channel_type, config_key, config_value, encrypted, is_mock) 
           VALUES ($1, $2, $3, $4, $5)`,
          [channel, key, finalValue, isEncrypted, isMock]
        );
      }
      
      // Refresh cache
      await this.refreshAllConfigs();
      
      logger.info(`Updated ${channel} configuration (${isMock ? 'mock' : 'real'})`);
      return true;
    } catch (error: any) {
      logger.error(`Failed to set ${channel} configuration:`, error);
      return false;
    }
  }

  /**
   * Test connection for a channel (mock or real)
   */
  async testConnection(channel: string, isMock: boolean): Promise<{ success: boolean; message: string }> {
    try {
      const config = await this.getChannelConfigByMode(channel, isMock);
      
      if (channel === 'email') {
        // For email, we can't easily test without sending
        // Just verify required fields are present
        if (!config.smtp_host || !config.smtp_port) {
          return { success: false, message: 'Missing required SMTP configuration' };
        }
        return { success: true, message: 'Email configuration looks valid' };
      }
      
      if (channel === 'sms') {
        if (isMock) {
          // Test mock SMS server
          const axios = require('axios');
          try {
            await axios.get(`${config.api_url.replace('/sms/send', '')}/health`, { timeout: 5000 });
            return { success: true, message: 'Mock SMS server is reachable' };
          } catch (error: any) {
            return { success: false, message: `Mock SMS server unreachable: ${error.message}` };
          }
        } else {
          // For real SMS modems, we'll test via the modem pool
          return { success: true, message: 'SMS modem configuration saved (test via modem pool)' };
        }
      }
      
      return { success: true, message: 'Configuration saved' };
    } catch (error: any) {
      logger.error(`Test connection failed for ${channel}:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Force refresh configurations
   */
  async refresh(): Promise<void> {
    await this.refreshAllConfigs();
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    logger.info('Configuration service shutdown');
  }
}

// Singleton instance
const configurationService = new ConfigurationService();

export default configurationService;
