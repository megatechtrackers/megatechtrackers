import db from '../db';
import logger from '../utils/logger';
import metrics from '../utils/metrics';
import config from '../config';
import * as os from 'os';

/**
 * Worker Registry Service
 * 
 * Manages worker registration, health checks, and automatic lock release
 * Ensures stateless worker architecture with proper cleanup
 */
interface Worker {
  id: string;
  hostname: string;
  pid: number;
  started_at: Date;
  last_heartbeat: Date;
  status: 'active' | 'idle' | 'stale' | 'dead';
}

class WorkerRegistry {
  private workerId: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL: number;
  private readonly CLEANUP_INTERVAL: number;
  private readonly STALE_THRESHOLD: number;
  private readonly DEAD_THRESHOLD: number;

  constructor() {
    this.workerId = `${os.hostname()}-${process.pid}`;
    this.HEARTBEAT_INTERVAL = config.workerRegistry.heartbeatInterval;
    this.CLEANUP_INTERVAL = config.workerRegistry.cleanupInterval;
    this.STALE_THRESHOLD = config.workerRegistry.staleThreshold;
    this.DEAD_THRESHOLD = config.workerRegistry.deadThreshold;
  }

  async initialize(): Promise<void> {
    try {
      // Create workers table if it doesn't exist
      await this.createWorkersTable();
      
      // Register this worker
      await this.register();
      
      // Start heartbeat
      this.startHeartbeat();
      
      // Start cleanup process
      this.startCleanup();
      
      logger.info('Worker registry initialized', { workerId: this.workerId });
    } catch (error) {
      logger.error('Failed to initialize worker registry:', error);
      throw error;
    }
  }

  private async createWorkersTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS alarms_workers (
        id VARCHAR(255) PRIMARY KEY,
        hostname VARCHAR(255) NOT NULL,
        pid INTEGER NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        last_heartbeat TIMESTAMPTZ NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        metadata JSONB DEFAULT '{}'::jsonb
      );
      
      CREATE INDEX IF NOT EXISTS idx_alarms_workers_last_heartbeat ON alarms_workers(last_heartbeat);
      CREATE INDEX IF NOT EXISTS idx_alarms_workers_status ON alarms_workers(status);
    `;
    
    await db.query(query);
  }

  async register(): Promise<void> {
    const query = `
      INSERT INTO alarms_workers (id, hostname, pid, started_at, last_heartbeat, status)
      VALUES ($1, $2, $3, NOW(), NOW(), 'active')
      ON CONFLICT (id) DO UPDATE SET
        last_heartbeat = NOW(),
        status = 'active'
      RETURNING *
    `;
    
    try {
      await db.query(query, [
        this.workerId,
        os.hostname(),
        process.pid
      ]);
      
      logger.debug('Worker registered', { workerId: this.workerId });
      metrics.setGauge('worker_registered', 1);
      
      // Update worker count metrics immediately after registration
      await this.updateWorkerMetrics();
    } catch (error) {
      logger.error('Error registering worker:', error);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL);
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      const query = `
        UPDATE alarms_workers
        SET last_heartbeat = NOW()
        WHERE id = $1
        RETURNING *
      `;
      
      const result = await db.query(query, [this.workerId]);
      
      if (result.rows.length === 0) {
        // Worker was removed, re-register
        await this.register();
      }
      
      metrics.incrementCounter('worker_heartbeat');
    } catch (error) {
      logger.error('Error sending heartbeat:', error);
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupStaleWorkers();
    }, this.CLEANUP_INTERVAL);
  }

  private async cleanupStaleWorkers(): Promise<void> {
    try {
      // Mark stale workers
      const staleQuery = `
        UPDATE alarms_workers
        SET status = CASE
          WHEN last_heartbeat < NOW() - INTERVAL '${this.DEAD_THRESHOLD / 1000} seconds' THEN 'dead'
          WHEN last_heartbeat < NOW() - INTERVAL '${this.STALE_THRESHOLD / 1000} seconds' THEN 'stale'
          ELSE status
        END
        WHERE last_heartbeat < NOW() - INTERVAL '${this.STALE_THRESHOLD / 1000} seconds'
      `;
      
      await db.query(staleQuery);
      
      // Note: Lock cleanup removed - no longer using database locking with RabbitMQ
      
      // Remove dead workers (older than 1 hour)
      const removeQuery = `
        DELETE FROM alarms_workers
        WHERE status = 'dead' 
          AND last_heartbeat < NOW() - INTERVAL '1 hour'
      `;
      
      const removeResult = await db.query(removeQuery);
      
      if (removeResult.rowCount && removeResult.rowCount > 0) {
        logger.info(`Removed ${removeResult.rowCount} dead workers`);
        metrics.incrementCounter('dead_workers_removed', removeResult.rowCount);
      }
      
      // Update worker metrics
      await this.updateWorkerMetrics();
    } catch (error) {
      logger.error('Error cleaning up stale workers:', error);
    }
  }
  
  private async updateWorkerMetrics(): Promise<void> {
    try {
      const stats = await this.getWorkerStats();
      metrics.setGauge('active_workers_count', stats.active);
      metrics.setGauge('stale_workers_count', stats.stale);
    } catch (error) {
      logger.error('Error updating worker metrics:', error);
    }
  }

  async getWorkers(): Promise<Worker[]> {
    try {
      const query = `
        SELECT id, hostname, pid, started_at, last_heartbeat, status
        FROM alarms_workers
        ORDER BY last_heartbeat DESC
      `;
      
      const result = await db.query(query);
      return result.rows.map((row: any) => ({
        id: row.id,
        hostname: row.hostname,
        pid: row.pid,
        started_at: row.started_at,
        last_heartbeat: row.last_heartbeat,
        status: row.status,
      }));
    } catch (error) {
      logger.error('Error getting workers:', error);
      return [];
    }
  }

  async getHealthyWorkers(): Promise<Worker[]> {
    try {
      const query = `
        SELECT id, hostname, pid, started_at, last_heartbeat, status
        FROM alarms_workers
        WHERE status = 'active'
          AND last_heartbeat > NOW() - INTERVAL '${this.STALE_THRESHOLD / 1000} seconds'
        ORDER BY last_heartbeat DESC
      `;
      
      const result = await db.query(query);
      return result.rows.map((row: any) => ({
        id: row.id,
        hostname: row.hostname,
        pid: row.pid,
        started_at: row.started_at,
        last_heartbeat: row.last_heartbeat,
        status: row.status as 'active' | 'idle' | 'stale' | 'dead',
      }));
    } catch (error) {
      logger.error('Error getting healthy workers:', error);
      return [];
    }
  }
  
  async selectWorkerForLoad(): Promise<string | null> {
    try {
      const healthyWorkers = await this.getHealthyWorkers();
      if (healthyWorkers.length === 0) {
        return null;
      }
      
      // Simple round-robin selection based on worker ID hash
      // In a real implementation, you'd track load per worker
      const index = Math.floor(Math.random() * healthyWorkers.length);
      return healthyWorkers[index].id;
    } catch (error) {
      logger.error('Error selecting worker for load:', error);
      return null;
    }
  }
  
  async getWorkerStats(): Promise<{
    total: number;
    active: number;
    stale: number;
    dead: number;
    healthy: number;
  }> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'stale') as stale,
          COUNT(*) FILTER (WHERE status = 'dead') as dead,
          COUNT(*) FILTER (WHERE status = 'active' AND last_heartbeat > NOW() - INTERVAL '${this.STALE_THRESHOLD / 1000} seconds') as healthy
        FROM alarms_workers
      `;
      
      const result = await db.query(query);
      const row = result.rows[0];
      
      return {
        total: parseInt(row.total) || 0,
        active: parseInt(row.active) || 0,
        stale: parseInt(row.stale) || 0,
        dead: parseInt(row.dead) || 0,
        healthy: parseInt(row.healthy) || 0,
      };
    } catch (error) {
      logger.error('Error getting worker stats:', error);
      return {
        total: 0,
        active: 0,
        stale: 0,
        dead: 0,
        healthy: 0,
      };
    }
  }

  async unregister(): Promise<void> {
    try {
      const query = `
        DELETE FROM alarms_workers WHERE id = $1
      `;
      
      await db.query(query, [this.workerId]);
      
      logger.info('Worker unregistered', { workerId: this.workerId });
    } catch (error) {
      logger.error('Error unregistering worker:', error);
    }
  }

  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.unregister().catch(error => {
      logger.error('Error during worker unregistration:', error);
    });
    
    logger.info('Worker registry shut down');
  }

  getWorkerId(): string {
    return this.workerId;
  }
}

export default new WorkerRegistry();
