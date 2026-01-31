import logger from '../utils/logger';
import db from '../db';

/**
 * System State Manager
 * Manages system state (running/paused) and mock mode toggles
 */

export type SystemStateType = 'running' | 'paused' | 'restarting';
export type ChannelType = 'sms' | 'email';

export interface SystemState {
  id: number;
  state: SystemStateType;
  paused_at: Date | null;
  paused_by: string | null;
  reason: string | null;
  use_mock_sms: boolean;
  use_mock_email: boolean;
  updated_at: Date;
}

class SystemStateManager {
  private cachedState: SystemState | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_INTERVAL_MS = 10000; // 10 seconds

  /**
   * Initialize the system state manager
   */
  async initialize(): Promise<void> {
    try {
      // Load initial state
      await this.refreshState();
      
      // Start periodic refresh
      this.refreshInterval = setInterval(async () => {
        try {
          await this.refreshState();
        } catch (error: any) {
          logger.error('Failed to refresh system state:', error);
        }
      }, this.REFRESH_INTERVAL_MS);
      
      logger.info('System state manager initialized');
    } catch (error: any) {
      logger.error('Failed to initialize system state manager:', error);
      throw error;
    }
  }

  /**
   * Refresh the cached state from database
   */
  private async refreshState(): Promise<void> {
    try {
      const result = await db.query(
        'SELECT * FROM alarms_state ORDER BY id DESC LIMIT 1'
      ) as { rows: SystemState[] };
      
      if (result.rows.length > 0) {
        this.cachedState = result.rows[0];
      } else {
        // Create initial state if not exists
        const insertResult = await db.query(
          `INSERT INTO alarms_state (state, use_mock_sms, use_mock_email) 
           VALUES ('running', false, false) 
           RETURNING *`
        ) as { rows: SystemState[] };
        this.cachedState = insertResult.rows[0];
        logger.info('Created initial system state');
      }
    } catch (error: any) {
      logger.error('Failed to refresh system state:', error);
      throw error;
    }
  }

  /**
   * Get current system state
   * Returns cached state for performance
   */
  getState(): SystemState | null {
    return this.cachedState;
  }

  /**
   * Get current system state directly from database
   */
  async getStateFromDB(): Promise<SystemState> {
    const result = await db.query(
      'SELECT * FROM alarms_state ORDER BY id DESC LIMIT 1'
    ) as { rows: SystemState[] };
    
    if (result.rows.length === 0) {
      throw new Error('System state not found');
    }
    
    this.cachedState = result.rows[0];
    return result.rows[0];
  }

  /**
   * Check if system is paused
   */
  isPaused(): boolean {
    return this.cachedState?.state === 'paused';
  }

  /**
   * Check if mock mode is enabled for a channel
   */
  isMockMode(channel: ChannelType): boolean {
    if (!this.cachedState) {
      return false;
    }
    
    return channel === 'sms' 
      ? this.cachedState.use_mock_sms 
      : this.cachedState.use_mock_email;
  }

  /**
   * Pause the system
   */
  async pause(reason: string, pausedBy: string = 'admin'): Promise<boolean> {
    try {
      await db.query(
        `UPDATE alarms_state 
         SET state = 'paused', 
             paused_at = NOW(), 
             paused_by = $1, 
             reason = $2, 
             updated_at = NOW()`,
        [pausedBy, reason]
      );
      
      await this.refreshState();
      logger.info(`System paused by ${pausedBy}: ${reason}`);
      return true;
    } catch (error: any) {
      logger.error('Failed to pause system:', error);
      return false;
    }
  }

  /**
   * Resume the system
   */
  async resume(): Promise<boolean> {
    try {
      await db.query(
        `UPDATE alarms_state 
         SET state = 'running', 
             paused_at = NULL, 
             paused_by = NULL, 
             reason = NULL, 
             updated_at = NOW()`
      );
      
      await this.refreshState();
      logger.info('System resumed');
      return true;
    } catch (error: any) {
      logger.error('Failed to resume system:', error);
      return false;
    }
  }

  /**
   * Set mock mode for a channel
   */
  async setMockMode(channel: ChannelType, enabled: boolean): Promise<boolean> {
    try {
      const column = channel === 'sms' ? 'use_mock_sms' : 'use_mock_email';
      
      await db.query(
        `UPDATE alarms_state 
         SET ${column} = $1, updated_at = NOW()`,
        [enabled]
      );
      
      await this.refreshState();
      logger.info(`${channel.toUpperCase()} mock mode ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } catch (error: any) {
      logger.error(`Failed to set mock mode for ${channel}:`, error);
      return false;
    }
  }

  /**
   * Set mock mode for all channels
   */
  async setAllMockMode(enabled: boolean): Promise<boolean> {
    try {
      await db.query(
        `UPDATE alarms_state 
         SET use_mock_sms = $1, 
             use_mock_email = $1, 
             updated_at = NOW()`,
        [enabled]
      );
      
      await this.refreshState();
      logger.info(`All mock modes ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } catch (error: any) {
      logger.error('Failed to set all mock modes:', error);
      return false;
    }
  }

  /**
   * Restart the system (pause, wait, resume)
   */
  async restart(reason: string = 'manual restart'): Promise<boolean> {
    try {
      // Set to restarting state
      await db.query(
        `UPDATE alarms_state 
         SET state = 'restarting', 
             reason = $1, 
             updated_at = NOW()`,
        [reason]
      );
      
      await this.refreshState();
      logger.info(`System restarting: ${reason}`);
      
      // Wait a moment for in-flight operations
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Resume
      await this.resume();
      
      return true;
    } catch (error: any) {
      logger.error('Failed to restart system:', error);
      return false;
    }
  }

  /**
   * Shutdown the manager
   */
  shutdown(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    logger.info('System state manager shutdown');
  }
}

// Singleton instance
const systemStateManager = new SystemStateManager();

export default systemStateManager;
