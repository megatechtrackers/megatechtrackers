import logger from '../utils/logger';
import { decrypt, isEncrypted } from '../utils/encryption';
import db from '../db';
import TeltonikaClient from '../clients/teltonikaClient';
import MockSmsClient from '../clients/mockSmsClient';
import systemStateManager from './systemState';
import configurationService from './configurationService';
import metrics from '../utils/metrics';

/**
 * SMS Modem Pool
 * Manages multiple SMS modems with load balancing, health checks, and failover
 */

// Service types that can use modems
export type SmsServiceType = 'alarms' | 'commands' | 'otp' | 'marketing';

export interface ModemConfig {
  id: number;
  name: string;
  host: string;
  username: string;
  password_encrypted: string;
  cert_fingerprint?: string;
  modem_id: string;
  enabled: boolean;
  priority: number;
  max_concurrent_sms: number;
  health_status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown' | 'quota_exhausted';
  last_health_check: Date | null;
  // SMS Package fields
  sms_sent_count: number;
  sms_limit: number;
  package_cost: number;
  package_currency: string;
  package_start_date: Date | null;
  package_end_date: Date | null;
  last_count_reset: Date | null;
  // Service assignment
  allowed_services: string[];
}

export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  modemId?: number;      // Database ID of modem used
  modemName?: string;    // Name of modem used
  error?: string;
  smsUsed?: number;
  selectionTier?: 'device' | 'service' | 'fallback' | 'mock';  // How modem was selected
}

export interface SendSmsOptions {
  service?: SmsServiceType;      // Service type for pool selection
  deviceModemId?: number | null; // Device-specific modem ID (from unit.modem_id)
  imei?: string | number;        // Device IMEI (to lookup modem_id if not provided)
}

export interface PoolStatus {
  totalModems: number;
  healthyModems: number;
  degradedModems: number;
  unhealthyModems: number;
  quotaExhaustedModems: number;
  isMockMode: boolean;
  totalSmsUsed: number;
  totalSmsLimit: number;
  usagePercentage: number;
  modems: Array<{
    id: number;
    name: string;
    host: string;
    enabled: boolean;
    priority: number;
    health_status: string;
    last_health_check: Date | null;
    sms_sent_count: number;
    sms_limit: number;
    usage_percentage: number;
    remaining_quota: number;
    package_cost: number;
    package_currency: string;
    package_end_date: Date | null;
  }>;
}

class SmsModemPool {
  private modems: Map<number, TeltonikaClient> = new Map();
  private modemConfigs: Map<number, ModemConfig> = new Map();
  private mockClient: MockSmsClient | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL_MS = 60000; // 1 minute
  private inFlightRequests: Map<number, number> = new Map(); // Track concurrent requests per modem

  /**
   * Initialize the SMS modem pool
   */
  async initialize(): Promise<void> {
    try {
      // Load modems from database
      await this.loadModems();
      
      // Initialize mock client
      await this.initializeMockClient();
      
      // Start health checks
      this.startHealthChecks();
      
      logger.info(`SMS modem pool initialized with ${this.modems.size} modems`);
    } catch (error: any) {
      logger.error('Failed to initialize SMS modem pool:', error);
      throw error;
    }
  }

  /**
   * Load modem configurations from database
   */
  private async loadModems(): Promise<void> {
    try {
      const result = await db.query(
        `SELECT *, 
         COALESCE(allowed_services, ARRAY['alarms', 'commands']) as allowed_services 
         FROM alarms_sms_modems WHERE enabled = true ORDER BY priority DESC, id ASC`
      ) as { rows: ModemConfig[] };
      
      this.modems.clear();
      this.modemConfigs.clear();
      this.inFlightRequests.clear();
      
      for (const config of result.rows) {
        // Decrypt password
        let password = config.password_encrypted;
        if (isEncrypted(password)) {
          try {
            password = decrypt(password);
          } catch (error: any) {
            logger.error(`Failed to decrypt password for modem ${config.name}:`, error);
            continue;
          }
        }
        
        // Create Teltonika client
        const client = new TeltonikaClient({
          url: config.host,
          username: config.username,
          password: password,
          certFingerprint: config.cert_fingerprint || undefined,
          requireCertVerification: false, // Optional for now
        });
        
        // Proactively establish session (login once)
        logger.debug(`Establishing session for modem: ${config.name}`);
        const loginSuccess = await client.ensureLoggedIn();
        if (loginSuccess) {
          logger.info(`Session established for modem: ${config.name}`);
        } else {
          logger.warn(`Failed to establish session for modem: ${config.name} - will retry on first SMS`);
        }
        
        this.modems.set(config.id, client);
        this.modemConfigs.set(config.id, config);
        this.inFlightRequests.set(config.id, 0);
        
        // Initialize Prometheus metrics with existing database values
        const sentCount = Number(config.sms_sent_count) || 0;
        const limit = Number(config.sms_limit) || 0;
        metrics.setGauge('sms_modem_usage_count', sentCount, { modem_name: config.name });
        metrics.setGauge('sms_modem_usage_limit', limit, { modem_name: config.name });
        logger.debug(`Initialized metrics for modem ${config.name}: ${sentCount}/${limit}`);
      }
      
      // Update pool-level metrics
      this.updatePoolMetrics();
      
      logger.info(`Loaded ${this.modems.size} SMS modems from database`);
    } catch (error: any) {
      logger.error('Failed to load SMS modems:', error);
      throw error;
    }
  }

  /**
   * Initialize mock SMS client
   */
  private async initializeMockClient(): Promise<void> {
    try {
      const config = await configurationService.getChannelConfigByMode('sms', true);
      
      this.mockClient = new MockSmsClient({
        apiUrl: config.api_url || 'http://mock-sms-server:8086/sms/send',
        apiKey: config.api_key || 'mock-api-key',
      });
      
      logger.info('Mock SMS client initialized');
    } catch (error: any) {
      logger.error('Failed to initialize mock SMS client:', error);
    }
  }

  /**
   * Check if mock mode is enabled
   */
  isMockMode(): boolean {
    return systemStateManager.isMockMode('sms');
  }

  /**
   * Send SMS via modem pool or mock server
   * 
   * Selection priority (hybrid approach):
   * 1. Device has modem_id AND modem exists → Use that modem
   * 2. Device modem_id not found (invalid) → Use service pool
   * 3. Device has no modem_id → Use service pool
   * 4. Service pool exhausted → Fallback to any modem
   * 
   * @param phoneNumber Destination phone number
   * @param message SMS message content
   * @param options Selection options (service type, device modem ID)
   */
  async sendSms(phoneNumber: string, message: string, options?: SendSmsOptions): Promise<SendSmsResult> {
    // Check if mock mode
    if (this.isMockMode()) {
      return this.sendViaMock(phoneNumber, message);
    }
    
    // Use real modem pool with hybrid selection
    return this.sendViaModemPoolHybrid(phoneNumber, message, options);
  }

  /**
   * Get device-specific modem ID from unit table
   */
  async getDeviceModemId(imei: string | number): Promise<number | null> {
    try {
      const result = await db.query(
        'SELECT modem_id FROM unit WHERE imei = $1 LIMIT 1',
        [String(imei)]
      );
      
      if (result.rows.length > 0 && result.rows[0].modem_id) {
        return result.rows[0].modem_id;
      }
      return null;
    } catch (error: any) {
      logger.warn(`Failed to get device modem_id for IMEI ${imei}:`, error.message);
      return null;
    }
  }

  /**
   * Check if a specific modem exists and is available
   * 
   * Allows: healthy, unknown, degraded (might still work)
   * Blocks: unhealthy, quota_exhausted (definitely won't work)
   */
  private isModemAvailable(modemId: number): boolean {
    const config = this.modemConfigs.get(modemId);
    if (!config) return false;
    if (!config.enabled) return false;
    
    // Block only completely dead states - degraded might still work
    const blockedStatuses = ['unhealthy', 'quota_exhausted'];
    if (blockedStatuses.includes(config.health_status)) return false;
    
    // Check quota
    const sentCount = Number(config.sms_sent_count) || 0;
    const limit = Number(config.sms_limit) || 0;
    if (sentCount >= limit) return false;
    
    return true;
  }

  /**
   * Send SMS with hybrid modem selection
   */
  private async sendViaModemPoolHybrid(
    phoneNumber: string, 
    message: string, 
    options?: SendSmsOptions
  ): Promise<SendSmsResult> {
    const service = options?.service || 'alarms';
    let deviceModemId = options?.deviceModemId;
    
    // If IMEI provided but no deviceModemId, look it up
    if (!deviceModemId && options?.imei) {
      deviceModemId = await this.getDeviceModemId(options.imei);
    }
    
    // TIER 1: Try device-specific modem
    if (deviceModemId && this.isModemAvailable(deviceModemId)) {
      const result = await this.sendViaSpecificModem(phoneNumber, message, deviceModemId);
      if (result.success) {
        result.selectionTier = 'device';
        metrics.incrementCounter('sms_sent_dedicated', { service, tier: 'device' });
        return result;
      }
      logger.warn(`Device-specific modem ${deviceModemId} failed, trying service pool`);
    } else if (deviceModemId) {
      logger.debug(`Device modem_id ${deviceModemId} not found or unavailable, using service pool`);
      metrics.incrementCounter('sms_device_modem_not_found', { service });
    }
    
    // TIER 2: Try service-specific pool
    const serviceModems = this.getServiceModems(service);
    if (serviceModems.length > 0) {
      const result = await this.sendViaModemList(phoneNumber, message, serviceModems);
      if (result.success) {
        result.selectionTier = 'service';
        metrics.incrementCounter('sms_sent_dedicated', { service, tier: 'service' });
        return result;
      }
      logger.warn(`Service pool (${service}) exhausted, trying fallback`);
      metrics.incrementCounter('sms_service_pool_exhausted', { service });
    } else {
      logger.debug(`No dedicated modems for service ${service}, using fallback`);
    }
    
    // TIER 3: Fallback to any available modem
    const allModems = this.getHealthyModems();
    if (allModems.length > 0) {
      const result = await this.sendViaModemList(phoneNumber, message, allModems);
      if (result.success) {
        result.selectionTier = 'fallback';
        metrics.incrementCounter('sms_sent_fallback', { service });
        logger.info(`SMS sent via FALLBACK modem for ${service}`, {
          modem: result.modemName,
          phone: phoneNumber.slice(-4)
        });
        return result;
      }
    }
    
    // All tiers failed
    logger.error(`All modems exhausted for ${service}`);
    metrics.incrementCounter('sms_all_modems_exhausted', { service });
    return { success: false, error: 'All modems exhausted' };
  }

  /**
   * Send via a specific modem by ID
   */
  private async sendViaSpecificModem(
    phoneNumber: string,
    message: string,
    modemId: number
  ): Promise<SendSmsResult> {
    const client = this.modems.get(modemId);
    const config = this.modemConfigs.get(modemId);
    
    if (!client || !config) {
      return { success: false, error: `Modem ${modemId} not found` };
    }
    
    // Check max concurrent
    const inFlight = this.inFlightRequests.get(modemId) || 0;
    if (inFlight >= config.max_concurrent_sms) {
      return { success: false, error: `Modem ${config.name} at max concurrency` };
    }
    
    this.inFlightRequests.set(modemId, inFlight + 1);
    
    try {
      const result = await client.sendSms(phoneNumber, message, config.modem_id);
      
      if (result.success) {
        metrics.incrementCounter('sms_sent_total', { modem: config.name, status: 'success' });
        const smsUsed = result.smsUsed || 1;
        await this.incrementSmsCount(modemId, smsUsed);
        
        return {
          success: true,
          modemId: config.id,
          modemName: config.name,
          smsUsed: smsUsed,
        };
      } else {
        metrics.incrementCounter('sms_sent_total', { modem: config.name, status: 'failed' });
        return { success: false, error: result.error, modemName: config.name };
      }
    } catch (error: any) {
      metrics.incrementCounter('sms_sent_total', { modem: config.name, status: 'error' });
      return { success: false, error: error.message, modemName: config.name };
    } finally {
      this.inFlightRequests.set(modemId, Math.max(0, (this.inFlightRequests.get(modemId) || 1) - 1));
    }
  }

  /**
   * Get modems filtered by service type
   * Allows: healthy, unknown, degraded (might still work)
   * Blocks: unhealthy, quota_exhausted
   */
  private getServiceModems(service: SmsServiceType): Array<{ id: number; client: TeltonikaClient; config: ModemConfig }> {
    const available: Array<{ id: number; client: TeltonikaClient; config: ModemConfig }> = [];
    const blockedStatuses = ['unhealthy', 'quota_exhausted'];
    
    for (const [id, client] of this.modems.entries()) {
      const config = this.modemConfigs.get(id);
      if (!config || !config.enabled) continue;
      
      // Check if modem allows this service
      if (!config.allowed_services || !config.allowed_services.includes(service)) {
        continue;
      }
      
      // Block only completely dead states - degraded might still work
      if (blockedStatuses.includes(config.health_status)) continue;
      
      // Must have remaining quota
      const sentCount = Number(config.sms_sent_count) || 0;
      const limit = Number(config.sms_limit) || 0;
      if (sentCount >= limit) continue;
      
      available.push({ id, client, config });
    }
    
    // Sort by remaining quota (highest first), but prefer healthy over degraded
    available.sort((a, b) => {
      // Healthy first
      const healthyA = a.config.health_status === 'healthy' ? 0 : 1;
      const healthyB = b.config.health_status === 'healthy' ? 0 : 1;
      if (healthyA !== healthyB) return healthyA - healthyB;
      
      // Then by remaining quota
      const remainingA = (Number(a.config.sms_limit) || 0) - (Number(a.config.sms_sent_count) || 0);
      const remainingB = (Number(b.config.sms_limit) || 0) - (Number(b.config.sms_sent_count) || 0);
      return remainingB - remainingA;
    });
    
    return available;
  }

  /**
   * Send SMS via a list of modems (tries in order)
   */
  private async sendViaModemList(
    phoneNumber: string,
    message: string,
    modems: Array<{ id: number; client: TeltonikaClient; config: ModemConfig }>
  ): Promise<SendSmsResult> {
    const maxAttempts = Math.min(3, modems.length);
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const modem = modems[attempt];
      if (!modem) continue;
      
      const result = await this.sendViaSpecificModem(phoneNumber, message, modem.id);
      if (result.success) {
        return result;
      }
      
      // Update health status on failure
      await this.updateModemHealth(modem.id, 'degraded');
    }
    
    return { success: false, error: 'All attempted modems failed' };
  }

  /**
   * Send SMS via mock server
   */
  private async sendViaMock(phoneNumber: string, message: string): Promise<SendSmsResult> {
    if (!this.mockClient) {
      logger.error('Mock SMS client not initialized');
      return { success: false, error: 'Mock SMS client not initialized' };
    }
    
    try {
      const result = await this.mockClient.sendSms(phoneNumber, message);
      
      // Track metrics
      if (result.success) {
        metrics.incrementCounter('sms_sent_total', { modem: 'mock', status: 'success' });
        
        // Increment SMS count on a mock modem for tracking
        await this.incrementMockSmsCount();
      } else {
        metrics.incrementCounter('sms_sent_total', { modem: 'mock', status: 'failed' });
      }
      
      return {
        success: result.success,
        messageId: result.messageId,
        modemName: 'mock-sms-server',
        selectionTier: 'mock',
        error: result.error,
      };
    } catch (error: any) {
      logger.error('Mock SMS send error:', error);
      metrics.incrementCounter('sms_sent_total', { modem: 'mock', status: 'error' });
      return { success: false, error: error.message };
    }
  }

  /**
   * Increment SMS count on a mock modem for tracking purposes
   * Uses the first mock modem found (by host containing 'mock')
   */
  private async incrementMockSmsCount(): Promise<void> {
    try {
      // Find a mock modem and increment its count
      // This keeps mock usage tracked in the same system as real modems
      const result = await db.query(`
        UPDATE alarms_sms_modems 
        SET sms_sent_count = sms_sent_count + 1, updated_at = NOW()
        WHERE host ILIKE '%mock%' AND enabled = true
        RETURNING id
      `);
      
      if (result.rows.length > 0) {
        // Also update daily usage
        const modemId = result.rows[0].id;
        await db.query(`
          INSERT INTO alarms_sms_modem_usage (modem_id, date, sms_count)
          VALUES ($1, CURRENT_DATE, 1)
          ON CONFLICT (modem_id, date)
          DO UPDATE SET sms_count = alarms_sms_modem_usage.sms_count + 1
        `, [modemId]);
      }
    } catch (error: any) {
      // Don't fail SMS send if tracking fails
      logger.warn('Failed to increment mock SMS count:', error.message);
    }
  }

  /**
   * Get available modems with quota, sorted by health then remaining quota
   * This is used for fallback tier (any modem)
   * Allows: healthy, unknown, degraded (might still work)
   * Blocks: unhealthy, quota_exhausted
   */
  private getHealthyModems(): Array<{ id: number; client: TeltonikaClient; config: ModemConfig }> {
    const available: Array<{ id: number; client: TeltonikaClient; config: ModemConfig }> = [];
    const blockedStatuses = ['unhealthy', 'quota_exhausted'];
    
    for (const [id, client] of this.modems.entries()) {
      const config = this.modemConfigs.get(id);
      if (!config || !config.enabled) {
        continue;
      }
      
      // Block only completely dead states - degraded might still work
      if (blockedStatuses.includes(config.health_status)) {
        continue;
      }
      
      // Must have remaining quota (convert to numbers - PostgreSQL returns BIGINT as strings)
      const sentCount = Number(config.sms_sent_count) || 0;
      const limit = Number(config.sms_limit) || 0;
      if (sentCount >= limit) {
        logger.debug(`Modem ${config.name} skipped - quota exhausted (${sentCount}/${limit})`);
        continue;
      }
      
      available.push({ id, client, config });
    }
    
    // Sort by health status first (healthy > unknown > degraded), then by remaining quota
    available.sort((a, b) => {
      // Health priority: healthy=0, unknown=1, degraded=2
      const healthPriority: Record<string, number> = { healthy: 0, unknown: 1, degraded: 2 };
      const healthA = healthPriority[a.config.health_status] ?? 2;
      const healthB = healthPriority[b.config.health_status] ?? 2;
      if (healthA !== healthB) return healthA - healthB;
      
      // Then by remaining quota (highest first)
      const limitA = Number(a.config.sms_limit) || 0;
      const sentA = Number(a.config.sms_sent_count) || 0;
      const limitB = Number(b.config.sms_limit) || 0;
      const sentB = Number(b.config.sms_sent_count) || 0;
      const remainingA = limitA - sentA;
      const remainingB = limitB - sentB;
      return remainingB - remainingA;
    });
    
    return available;
  }

  /**
   * Update pool-level Prometheus metrics (counts of healthy/unhealthy modems)
   */
  private updatePoolMetrics(): void {
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    let quotaExhausted = 0;

    for (const config of this.modemConfigs.values()) {
      switch (config.health_status) {
        case 'healthy':
          healthy++;
          break;
        case 'degraded':
          degraded++;
          break;
        case 'unhealthy':
        case 'unknown':
          unhealthy++;
          break;
        case 'quota_exhausted':
          quotaExhausted++;
          break;
      }
    }

    metrics.setGauge('sms_modem_pool_size', this.modemConfigs.size);
    metrics.setGauge('sms_modem_healthy_count', healthy);
    metrics.setGauge('sms_modem_degraded_count', degraded);
    metrics.setGauge('sms_modem_unhealthy_count', unhealthy);
    metrics.setGauge('sms_modem_quota_exhausted_count', quotaExhausted);
  }

  /**
   * Update modem health status in database
   */
  private async updateModemHealth(modemId: number, status: 'healthy' | 'degraded' | 'unhealthy' | 'quota_exhausted'): Promise<void> {
    try {
      await db.query(
        'UPDATE alarms_sms_modems SET health_status = $1, last_health_check = NOW(), updated_at = NOW() WHERE id = $2',
        [status, modemId]
      );
      
      // Update local cache
      const config = this.modemConfigs.get(modemId);
      if (config) {
        config.health_status = status;
        config.last_health_check = new Date();
      }
      
      // Update pool-level metrics
      this.updatePoolMetrics();
      
      logger.debug(`Modem ${modemId} health updated to: ${status}`);
    } catch (error: any) {
      logger.error(`Failed to update health for modem ${modemId}:`, error);
    }
  }

  /**
   * Increment SMS sent count for a modem (after successful send)
   */
  private async incrementSmsCount(modemId: number, count: number = 1): Promise<void> {
    try {
      // Update modem total count
      await db.query(
        'UPDATE alarms_sms_modems SET sms_sent_count = sms_sent_count + $1, updated_at = NOW() WHERE id = $2',
        [count, modemId]
      );
      
      // Update daily usage (upsert)
      await db.query(`
        INSERT INTO alarms_sms_modem_usage (modem_id, date, sms_count)
        VALUES ($1, CURRENT_DATE, $2)
        ON CONFLICT (modem_id, date)
        DO UPDATE SET sms_count = alarms_sms_modem_usage.sms_count + $2
      `, [modemId, count]);
      
      // Update local cache
      const config = this.modemConfigs.get(modemId);
      if (config) {
        // Convert to number before incrementing (PostgreSQL returns BIGINT as strings)
        config.sms_sent_count = (Number(config.sms_sent_count) || 0) + count;
        
        // Check if quota now exhausted (convert to numbers - PostgreSQL returns BIGINT as strings)
        const sentCount = Number(config.sms_sent_count) || 0;
        const limit = Number(config.sms_limit) || 0;
        if (sentCount >= limit) {
          logger.warn(`Modem ${config.name} reached SMS limit (${sentCount}/${limit})`);
          await this.updateModemHealth(modemId, 'quota_exhausted');
        }
      }
      
      // Update metrics
      if (config) {
        // Ensure numeric values (PostgreSQL returns strings for BIGINT)
        const sentCount = Number(config.sms_sent_count) || 0;
        const limit = Number(config.sms_limit) || 0;
        metrics.setGauge('sms_modem_usage_count', sentCount, { modem_name: config.name });
        metrics.setGauge('sms_modem_usage_limit', limit, { modem_name: config.name });
      }
    } catch (error: any) {
      logger.error(`Failed to increment SMS count for modem ${modemId}:`, error);
    }
  }

  /**
   * Reset package for a modem (called when package is reloaded)
   */
  async resetModemPackage(modemId: number, newLimit?: number, newCost?: number, newEndDate?: Date): Promise<boolean> {
    try {
      const updates: string[] = ['sms_sent_count = 0', 'last_count_reset = NOW()', "health_status = 'healthy'", 'updated_at = NOW()'];
      const params: any[] = [];
      let paramIndex = 1;
      
      if (newLimit !== undefined) {
        updates.push(`sms_limit = $${paramIndex++}`);
        params.push(newLimit);
      }
      if (newCost !== undefined) {
        updates.push(`package_cost = $${paramIndex++}`);
        params.push(newCost);
      }
      if (newEndDate !== undefined) {
        updates.push(`package_end_date = $${paramIndex++}`);
        params.push(newEndDate);
      }
      
      params.push(modemId);
      
      await db.query(
        `UPDATE alarms_sms_modems SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        params
      );
      
      // Update local cache
      const config = this.modemConfigs.get(modemId);
      if (config) {
        config.sms_sent_count = 0;
        config.health_status = 'healthy';
        config.last_count_reset = new Date();
        if (newLimit !== undefined) config.sms_limit = newLimit;
        if (newCost !== undefined) config.package_cost = newCost;
        if (newEndDate !== undefined) config.package_end_date = newEndDate;
      }
      
      logger.info(`Package reset for modem ${modemId}: count=0, status=healthy`);
      return true;
    } catch (error: any) {
      logger.error(`Failed to reset package for modem ${modemId}:`, error);
      return false;
    }
  }

  /**
   * Get usage report for all modems
   */
  async getUsageReport(): Promise<Array<{
    modem_id: number;
    modem_name: string;
    sms_sent_count: number;
    sms_limit: number;
    usage_percentage: number;
    remaining: number;
    package_cost: number;
    package_currency: string;
    cost_per_sms: number;
    package_end_date: Date | null;
    days_remaining: number | null;
  }>> {
    const report = [];
    
    for (const config of this.modemConfigs.values()) {
      const usagePercentage = config.sms_limit > 0 ? (config.sms_sent_count / config.sms_limit) * 100 : 0;
      const costPerSms = config.sms_limit > 0 ? config.package_cost / config.sms_limit : 0;
      
      let daysRemaining: number | null = null;
      if (config.package_end_date) {
        const now = new Date();
        const end = new Date(config.package_end_date);
        daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      report.push({
        modem_id: config.id,
        modem_name: config.name,
        sms_sent_count: config.sms_sent_count,
        sms_limit: config.sms_limit,
        usage_percentage: Math.round(usagePercentage * 100) / 100,
        remaining: config.sms_limit - config.sms_sent_count,
        package_cost: config.package_cost,
        package_currency: config.package_currency,
        cost_per_sms: Math.round(costPerSms * 10000) / 10000, // 4 decimal places
        package_end_date: config.package_end_date,
        days_remaining: daysRemaining,
      });
    }
    
    return report;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL_MS);
    
    // Initial health check
    this.performHealthChecks().catch(error => {
      logger.error('Initial health check failed:', error);
    });
  }

  /**
   * Perform health checks on all modems
   */
  async performHealthChecks(): Promise<void> {
    logger.debug('Performing modem health checks...');
    
    for (const [id, client] of this.modems.entries()) {
      const config = this.modemConfigs.get(id);
      if (!config || !config.enabled) {
        continue;
      }
      
      try {
        const isHealthy = await client.healthCheck();
        const newStatus = isHealthy ? 'healthy' : 'unhealthy';
        
        if (newStatus !== config.health_status) {
          logger.info(`Modem ${config.name} status changed: ${config.health_status} -> ${newStatus}`);
          await this.updateModemHealth(id, newStatus);
        }
      } catch (error: any) {
        logger.error(`Health check failed for modem ${config.name}:`, error);
        await this.updateModemHealth(id, 'unhealthy');
      }
    }
    
    // Update metrics from DB so Grafana shows correct usage/remaining (alarm dashboard uses API/DB;
    // SMS gateway and other writers update DB directly, so cache would be stale).
    let status: PoolStatus;
    try {
      status = await this.getPoolStatus();
      // Sync in-memory cache with DB so pool selection and next health cycle use fresh quota
      for (const m of status.modems) {
        const config = this.modemConfigs.get(m.id);
        if (config) {
          config.sms_sent_count = m.sms_sent_count;
          config.sms_limit = m.sms_limit;
          config.health_status = m.health_status as ModemConfig['health_status'];
        }
      }
    } catch (error: any) {
      logger.warn('Failed to refresh pool status from DB for metrics, using cache:', error?.message);
      status = this.getPoolStatusFromCache();
    }
    metrics.setGauge('sms_modem_pool_size', status.totalModems);
    metrics.setGauge('sms_modem_healthy_count', status.healthyModems);
    metrics.setGauge('sms_modem_degraded_count', status.degradedModems);
    metrics.setGauge('sms_modem_unhealthy_count', status.unhealthyModems);
    metrics.setGauge('sms_modem_quota_exhausted_count', status.quotaExhaustedModems);
    for (const modem of status.modems) {
      const sentCount = Number(modem.sms_sent_count) || 0;
      const limit = Number(modem.sms_limit) || 0;
      metrics.setGauge('sms_modem_usage_count', sentCount, { modem_name: modem.name });
      metrics.setGauge('sms_modem_usage_limit', limit, { modem_name: modem.name });
    }
  }

  /**
   * Get pool status with usage information (queries DB for fresh data)
   */
  async getPoolStatus(): Promise<PoolStatus> {
    try {
      // Query fresh data from database to avoid stale cache issues
      const result = await db.query(
        `SELECT id, name, host, enabled, priority, health_status, last_health_check,
                sms_sent_count, sms_limit, package_cost, package_currency, package_end_date
         FROM alarms_sms_modems ORDER BY priority DESC, id ASC`
      );
      
      const modems = result.rows;
      
      // Convert to numbers - PostgreSQL returns BIGINT as strings
      const totalSmsUsed = modems.reduce((sum: number, m: any) => sum + (Number(m.sms_sent_count) || 0), 0);
      const totalSmsLimit = modems.reduce((sum: number, m: any) => sum + (Number(m.sms_limit) || 0), 0);
      const usagePercentage = totalSmsLimit > 0 ? (totalSmsUsed / totalSmsLimit) * 100 : 0;
      
      return {
        totalModems: modems.length,
        healthyModems: modems.filter((m: any) => m.health_status === 'healthy').length,
        degradedModems: modems.filter((m: any) => m.health_status === 'degraded').length,
        unhealthyModems: modems.filter((m: any) => m.health_status === 'unhealthy').length,
        quotaExhaustedModems: modems.filter((m: any) => m.health_status === 'quota_exhausted').length,
        isMockMode: this.isMockMode(),
        totalSmsUsed,
        totalSmsLimit,
        usagePercentage: Math.round(usagePercentage * 100) / 100,
        modems: modems.map((m: any) => {
          const sentCount = Number(m.sms_sent_count) || 0;
          const limit = Number(m.sms_limit) || 0;
          const usagePct = limit > 0 ? (sentCount / limit) * 100 : 0;
          return {
            id: m.id,
            name: m.name,
            host: m.host,
            enabled: m.enabled,
            priority: m.priority,
            health_status: m.health_status,
            last_health_check: m.last_health_check,
            sms_sent_count: sentCount,
            sms_limit: limit,
            usage_percentage: Math.round(usagePct * 100) / 100,
            remaining_quota: limit - sentCount,
            package_cost: m.package_cost || 0,
            package_currency: m.package_currency || 'PKR',
            package_end_date: m.package_end_date,
          };
        }),
      };
    } catch (error: any) {
      logger.error('Failed to get pool status from DB:', error);
      // Fall back to cached data if DB query fails
      return this.getPoolStatusFromCache();
    }
  }

  /**
   * Get pool status from cache (fallback)
   */
  private getPoolStatusFromCache(): PoolStatus {
    const modems = Array.from(this.modemConfigs.values());
    
    // Convert to numbers - PostgreSQL returns BIGINT as strings
    const totalSmsUsed = modems.reduce((sum, m) => sum + (Number(m.sms_sent_count) || 0), 0);
    const totalSmsLimit = modems.reduce((sum, m) => sum + (Number(m.sms_limit) || 0), 0);
    const usagePercentage = totalSmsLimit > 0 ? (totalSmsUsed / totalSmsLimit) * 100 : 0;
    
    return {
      totalModems: modems.length,
      healthyModems: modems.filter(m => m.health_status === 'healthy').length,
      degradedModems: modems.filter(m => m.health_status === 'degraded').length,
      unhealthyModems: modems.filter(m => m.health_status === 'unhealthy').length,
      quotaExhaustedModems: modems.filter(m => m.health_status === 'quota_exhausted').length,
      isMockMode: this.isMockMode(),
      totalSmsUsed,
      totalSmsLimit,
      usagePercentage: Math.round(usagePercentage * 100) / 100,
      modems: modems.map(m => {
        const sentCount = Number(m.sms_sent_count) || 0;
        const limit = Number(m.sms_limit) || 0;
        const usagePct = limit > 0 ? (sentCount / limit) * 100 : 0;
        return {
          id: m.id,
          name: m.name,
          host: m.host,
          enabled: m.enabled,
          priority: m.priority,
          health_status: m.health_status,
          last_health_check: m.last_health_check,
          sms_sent_count: sentCount,
          sms_limit: limit,
          usage_percentage: Math.round(usagePct * 100) / 100,
          remaining_quota: limit - sentCount,
          package_cost: m.package_cost || 0,
          package_currency: m.package_currency || 'PKR',
          package_end_date: m.package_end_date,
        };
      }),
    };
  }

  /**
   * Reload modems from database
   */
  async reload(): Promise<void> {
    logger.info('Reloading SMS modem pool...');
    await this.loadModems();
    await this.initializeMockClient();
  }

  /**
   * Switch to mock mode
   */
  async switchToMock(): Promise<void> {
    await systemStateManager.setMockMode('sms', true);
    logger.info('Switched to mock SMS mode');
  }

  /**
   * Switch to real mode
   */
  async switchToReal(): Promise<void> {
    await systemStateManager.setMockMode('sms', false);
    await this.reload(); // Ensure modems are loaded
    logger.info('Switched to real SMS mode');
  }

  /**
   * Get the average cost per SMS across all modems (package_cost / sms_limit)
   * Returns 0 if in mock mode or no modems configured
   */
  getAverageCostPerSms(): number {
    if (this.isMockMode()) {
      return 0; // Mock mode is free
    }
    
    const modems = Array.from(this.modemConfigs.values());
    if (modems.length === 0) {
      return 0;
    }
    
    // Calculate weighted average based on remaining quota
    let totalCost = 0;
    let totalLimit = 0;
    
    for (const modem of modems) {
      if (modem.enabled && modem.sms_limit > 0) {
        totalCost += modem.package_cost;
        totalLimit += modem.sms_limit;
      }
    }
    
    if (totalLimit === 0) {
      return 0;
    }
    
    // Average cost per SMS = total package costs / total SMS limit
    return totalCost / totalLimit;
  }

  /**
   * Get cost per SMS for a specific modem
   */
  getModemCostPerSms(modemId: number): number {
    const config = this.modemConfigs.get(modemId);
    if (!config || config.sms_limit === 0) {
      return 0;
    }
    return config.package_cost / config.sms_limit;
  }

  /**
   * Shutdown the pool
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    logger.info('SMS modem pool shutdown');
  }
}

// Singleton instance
const smsModemPool = new SmsModemPool();

export default smsModemPool;
