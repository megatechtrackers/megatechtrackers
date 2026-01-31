import { Router, Request, Response } from 'express';
import db from '../db';
import logger from '../utils/logger';
import { encrypt } from '../utils/encryption';
import smsModemPool from '../services/smsModemPool';
import systemStateManager from '../services/systemState';
import configurationService from '../services/configurationService';
import { PushChannel } from '../channels/pushChannel';
import channelRegistry from '../channels';

const router = Router();

// ============================================================================
// SMS Modem Management
// ============================================================================

/**
 * GET /api/config/sms/modems
 * List all SMS modems with usage info
 */
router.get('/sms/modems', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, name, host, username, cert_fingerprint, modem_id, enabled, priority, max_concurrent_sms, 
              health_status, last_health_check, 
              sms_sent_count, sms_limit, package_cost, package_currency, 
              package_start_date, package_end_date, last_count_reset,
              COALESCE(allowed_services, ARRAY['alarms', 'commands']) as allowed_services,
              created_at, updated_at
       FROM alarms_sms_modems 
       ORDER BY priority DESC, id ASC`
    );
    
    // Add calculated fields
    const modems = result.rows.map(m => ({
      ...m,
      usage_percentage: m.sms_limit > 0 ? Math.round((m.sms_sent_count / m.sms_limit) * 10000) / 100 : 0,
      remaining_quota: (m.sms_limit || 0) - (m.sms_sent_count || 0),
    }));
    
    res.json({ success: true, modems });
  } catch (error: any) {
    logger.error('Failed to list SMS modems:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/config/sms/modems/:id
 * Get a specific SMS modem with usage info
 */
router.get('/sms/modems/:id', async (req: Request, res: Response) => {
  try {
    const modemId = parseInt(req.params.id);
    const result = await db.query(
      `SELECT id, name, host, username, cert_fingerprint, modem_id, enabled, priority, max_concurrent_sms, 
              health_status, last_health_check,
              sms_sent_count, sms_limit, package_cost, package_currency,
              package_start_date, package_end_date, last_count_reset,
              COALESCE(allowed_services, ARRAY['alarms', 'commands']) as allowed_services,
              created_at, updated_at
       FROM alarms_sms_modems 
       WHERE id = $1`,
      [modemId]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Modem not found' });
      return;
    }
    
    const m = result.rows[0];
    const modem = {
      ...m,
      usage_percentage: m.sms_limit > 0 ? Math.round((m.sms_sent_count / m.sms_limit) * 10000) / 100 : 0,
      remaining_quota: (m.sms_limit || 0) - (m.sms_sent_count || 0),
    };
    
    res.json({ success: true, modem });
  } catch (error: any) {
    logger.error('Failed to get SMS modem:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/sms/modems
 * Create a new SMS modem
 */
router.post('/sms/modems', async (req: Request, res: Response) => {
  try {
    const { name, host, username, password, cert_fingerprint, modem_id, enabled, priority, max_concurrent_sms,
            sms_limit, package_cost, package_currency, package_end_date, allowed_services } = req.body;
    
    // Validate required fields
    if (!name || !host || !username || !password || !modem_id) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }
    
    // Encrypt password
    const encryptedPassword = encrypt(password);
    
    // Default allowed_services if not provided
    const services = allowed_services && Array.isArray(allowed_services) 
      ? allowed_services 
      : ['alarms', 'commands'];
    
    const result = await db.query(
      `INSERT INTO alarms_sms_modems 
       (name, host, username, password_encrypted, cert_fingerprint, modem_id, enabled, priority, max_concurrent_sms,
        sms_limit, package_cost, package_currency, package_end_date, allowed_services)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, name, host, username, modem_id, enabled, priority, max_concurrent_sms, 
                 sms_limit, package_cost, package_currency, package_end_date, allowed_services, created_at`,
      [
        name,
        host,
        username,
        encryptedPassword,
        cert_fingerprint || null,
        modem_id,
        enabled !== false, // Default to true
        priority || 1,
        max_concurrent_sms || 5,
        sms_limit || 110000,
        package_cost || 1500.00,
        package_currency || 'PKR',
        package_end_date || null,
        services,
      ]
    );
    
    logger.info(`Created SMS modem: ${name} with services: ${services.join(', ')}`);
    
    // Reload modem pool
    await smsModemPool.reload();
    
    res.json({ success: true, modem: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to create SMS modem:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/config/sms/modems/:id
 * Update an existing SMS modem
 */
router.put('/sms/modems/:id', async (req: Request, res: Response) => {
  try {
    const modemId = parseInt(req.params.id);
    const { name, host, username, password, cert_fingerprint, modem_id, enabled, priority, max_concurrent_sms,
            sms_limit, package_cost, package_currency, package_end_date, allowed_services } = req.body;
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (host !== undefined) {
      updates.push(`host = $${paramIndex++}`);
      values.push(host);
    }
    if (username !== undefined) {
      updates.push(`username = $${paramIndex++}`);
      values.push(username);
    }
    if (password !== undefined && password !== '') {
      // Only update password if a new one is provided (not empty)
      updates.push(`password_encrypted = $${paramIndex++}`);
      values.push(encrypt(password));
    }
    if (cert_fingerprint !== undefined) {
      updates.push(`cert_fingerprint = $${paramIndex++}`);
      values.push(cert_fingerprint);
    }
    if (modem_id !== undefined) {
      updates.push(`modem_id = $${paramIndex++}`);
      values.push(modem_id);
    }
    if (enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      values.push(enabled);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    if (max_concurrent_sms !== undefined) {
      updates.push(`max_concurrent_sms = $${paramIndex++}`);
      values.push(max_concurrent_sms);
    }
    if (sms_limit !== undefined) {
      updates.push(`sms_limit = $${paramIndex++}`);
      values.push(sms_limit);
    }
    if (package_cost !== undefined) {
      updates.push(`package_cost = $${paramIndex++}`);
      values.push(package_cost);
    }
    if (package_currency !== undefined) {
      updates.push(`package_currency = $${paramIndex++}`);
      values.push(package_currency);
    }
    if (package_end_date !== undefined) {
      updates.push(`package_end_date = $${paramIndex++}`);
      values.push(package_end_date || null);
    }
    if (allowed_services !== undefined) {
      updates.push(`allowed_services = $${paramIndex++}`);
      values.push(Array.isArray(allowed_services) ? allowed_services : ['alarms', 'commands']);
    }
    
    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'No fields to update' });
      return;
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(modemId);
    
    const result = await db.query(
      `UPDATE alarms_sms_modems 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, host, username, modem_id, enabled, priority, max_concurrent_sms, 
                 sms_limit, package_cost, package_currency, package_end_date, updated_at`,
      values
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Modem not found' });
      return;
    }
    
    logger.info(`Updated SMS modem: ${modemId}`);
    
    // Reload modem pool
    await smsModemPool.reload();
    
    res.json({ success: true, modem: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to update SMS modem:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/config/sms/modems/:id
 * Delete an SMS modem
 */
router.delete('/sms/modems/:id', async (req: Request, res: Response) => {
  try {
    const modemId = parseInt(req.params.id);
    
    const result = await db.query(
      'DELETE FROM alarms_sms_modems WHERE id = $1 RETURNING name',
      [modemId]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Modem not found' });
      return;
    }
    
    logger.info(`Deleted SMS modem: ${result.rows[0].name}`);
    
    // Reload modem pool
    await smsModemPool.reload();
    
    res.json({ success: true, message: 'Modem deleted successfully' });
  } catch (error: any) {
    logger.error('Failed to delete SMS modem:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/config/sms/status
 * Get SMS modem pool status with usage info (queries DB for fresh data)
 */
router.get('/sms/status', async (_req: Request, res: Response) => {
  try {
    const status = await smsModemPool.getPoolStatus();
    res.json({ success: true, status });
  } catch (error: any) {
    logger.error('Failed to get SMS pool status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/config/sms/usage-report
 * Get detailed usage report for all modems
 */
router.get('/sms/usage-report', async (_req: Request, res: Response) => {
  try {
    const report = await smsModemPool.getUsageReport();
    
    // Calculate totals
    const totalUsed = report.reduce((sum, m) => sum + m.sms_sent_count, 0);
    const totalLimit = report.reduce((sum, m) => sum + m.sms_limit, 0);
    const totalCost = report.reduce((sum, m) => sum + m.package_cost, 0);
    
    res.json({
      success: true,
      summary: {
        total_modems: report.length,
        total_sms_used: totalUsed,
        total_sms_limit: totalLimit,
        overall_usage_percentage: totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 10000) / 100 : 0,
        total_package_cost: totalCost,
      },
      modems: report,
    });
  } catch (error: any) {
    logger.error('Failed to get SMS usage report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/config/sms/modems/:id/daily-usage
 * Get daily usage history for a modem
 */
router.get('/sms/modems/:id/daily-usage', async (req: Request, res: Response) => {
  try {
    const modemId = parseInt(req.params.id);
    const days = parseInt(req.query.days as string) || 30;
    
    const result = await db.query(
      `SELECT date, sms_count 
       FROM alarms_sms_modem_usage 
       WHERE modem_id = $1 AND date >= CURRENT_DATE - $2::INTEGER
       ORDER BY date DESC`,
      [modemId, days]
    );
    
    res.json({ success: true, usage: result.rows });
  } catch (error: any) {
    logger.error('Failed to get daily usage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/sms/modems/:id/reset-package
 * Reset package counter for a modem (when package is reloaded)
 */
router.post('/sms/modems/:id/reset-package', async (req: Request, res: Response) => {
  try {
    const modemId = parseInt(req.params.id);
    const { new_limit, new_cost, new_end_date } = req.body;
    
    const success = await smsModemPool.resetModemPackage(
      modemId,
      new_limit,
      new_cost,
      new_end_date ? new Date(new_end_date) : undefined
    );
    
    if (success) {
      logger.info(`Package reset for modem ${modemId}`);
      res.json({ success: true, message: 'Package reset successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to reset package' });
    }
  } catch (error: any) {
    logger.error('Failed to reset package:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/config/sms/modems/:id/package
 * Update package details for a modem (limit, cost, end date)
 */
router.put('/sms/modems/:id/package', async (req: Request, res: Response) => {
  try {
    const modemId = parseInt(req.params.id);
    const { sms_limit, package_cost, package_currency, package_start_date, package_end_date } = req.body;
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (sms_limit !== undefined) {
      updates.push(`sms_limit = $${paramIndex++}`);
      values.push(sms_limit);
    }
    if (package_cost !== undefined) {
      updates.push(`package_cost = $${paramIndex++}`);
      values.push(package_cost);
    }
    if (package_currency !== undefined) {
      updates.push(`package_currency = $${paramIndex++}`);
      values.push(package_currency);
    }
    if (package_start_date !== undefined) {
      updates.push(`package_start_date = $${paramIndex++}`);
      values.push(package_start_date);
    }
    if (package_end_date !== undefined) {
      updates.push(`package_end_date = $${paramIndex++}`);
      values.push(package_end_date);
    }
    
    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'No fields to update' });
      return;
    }
    
    updates.push('updated_at = NOW()');
    values.push(modemId);
    
    const result = await db.query(
      `UPDATE alarms_sms_modems SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id`,
      values
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Modem not found' });
      return;
    }
    
    // Reload modem pool to pick up changes
    await smsModemPool.reload();
    
    logger.info(`Package updated for modem ${modemId}`);
    res.json({ success: true, message: 'Package updated successfully' });
  } catch (error: any) {
    logger.error('Failed to update package:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Channel Configuration Management
// ============================================================================

/**
 * GET /api/config/channels
 * List all channel configurations
 */
router.get('/channels', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, channel_type, config_key, config_value, encrypted, is_mock, updated_at
       FROM alarms_channel_config 
       ORDER BY channel_type, is_mock, config_key`
    );
    
    // Don't return encrypted values
    const configs = result.rows.map(row => ({
      ...row,
      config_value: row.encrypted ? '***ENCRYPTED***' : row.config_value,
    }));
    
    res.json({ success: true, configurations: configs });
  } catch (error: any) {
    logger.error('Failed to list channel configurations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/config/channels
 * Update channel configuration
 */
router.put('/channels', async (req: Request, res: Response) => {
  try {
    const { channel_type, config_key, config_value, is_mock } = req.body;
    
    if (!channel_type || !config_key || config_value === undefined) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }
    
    // Determine if this field should be encrypted
    const shouldEncrypt = ['password', 'api_key', 'smtp_password', 'firebase_private_key'].includes(config_key);
    const finalValue = shouldEncrypt ? encrypt(config_value) : config_value;
    
    await db.query(
      `INSERT INTO alarms_channel_config (channel_type, config_key, config_value, encrypted, is_mock)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (channel_type, config_key, is_mock)
       DO UPDATE SET config_value = $3, encrypted = $4, updated_at = NOW()`,
      [channel_type, config_key, finalValue, shouldEncrypt, is_mock || false]
    );
    
    logger.info(`Updated channel configuration: ${channel_type}.${config_key} (mock=${is_mock})`);
    
    // Reload configuration cache
    await configurationService.reloadCache();
    
    // Reload specific channels if needed
    if (channel_type === 'sms') {
      await smsModemPool.reload();
    } else if (channel_type === 'email') {
      const emailChannel = channelRegistry.get('email');
      if (emailChannel && 'reload' in emailChannel) {
        await (emailChannel as any).reload();
      }
    }
    
    res.json({ success: true, message: 'Configuration updated successfully' });
  } catch (error: any) {
    logger.error('Failed to update channel configuration:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// System Control
// ============================================================================

/**
 * GET /api/config/system/state
 * Get current system state
 */
router.get('/system/state', async (_req: Request, res: Response) => {
  try {
    const state = await systemStateManager.getState();
    res.json({ success: true, state });
  } catch (error: any) {
    logger.error('Failed to get system state:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/system/pause
 * Pause the alarm processing system
 */
router.post('/system/pause', async (req: Request, res: Response) => {
  try {
    const { reason, paused_by } = req.body;
    
    await systemStateManager.pause(reason || 'Manual pause', paused_by || 'admin');
    
    logger.info('System paused', { reason, paused_by });
    res.json({ success: true, message: 'System paused successfully' });
  } catch (error: any) {
    logger.error('Failed to pause system:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/system/resume
 * Resume the alarm processing system
 */
router.post('/system/resume', async (_req: Request, res: Response) => {
  try {
    await systemStateManager.resume();
    
    logger.info('System resumed');
    res.json({ success: true, message: 'System resumed successfully' });
  } catch (error: any) {
    logger.error('Failed to resume system:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/system/mock-mode
 * Set mock mode for a channel
 */
router.post('/system/mock-mode', async (req: Request, res: Response) => {
  try {
    const { channel, enabled } = req.body;
    
    if (!channel || enabled === undefined) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }
    
    if (!['sms', 'email'].includes(channel)) {
      res.status(400).json({ success: false, error: 'Invalid channel type' });
      return;
    }
    
    await systemStateManager.setMockMode(channel as 'sms' | 'email', enabled);
    
    // Reload the appropriate service
    if (channel === 'sms') {
      if (enabled) {
        await smsModemPool.switchToMock();
      } else {
        await smsModemPool.switchToReal();
      }
    } else if (channel === 'email') {
      const emailChannel = channelRegistry.get('email');
      if (emailChannel && 'reload' in emailChannel) {
        await (emailChannel as any).reload();
      }
    }
    
    logger.info(`${channel} mock mode ${enabled ? 'enabled' : 'disabled'}`);
    res.json({ success: true, message: `Mock mode ${enabled ? 'enabled' : 'disabled'} for ${channel}` });
  } catch (error: any) {
    logger.error('Failed to set mock mode:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Push Notification Management
// ============================================================================

/**
 * POST /api/config/push/register
 * Register a device token for push notifications
 */
router.post('/push/register', async (req: Request, res: Response) => {
  try {
    const { user_id, device_token, device_type } = req.body;
    
    if (!user_id || !device_token || !device_type) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }
    
    if (!['ios', 'android', 'web'].includes(device_type)) {
      res.status(400).json({ success: false, error: 'Invalid device type' });
      return;
    }
    
    const pushChannel = channelRegistry.get('push') as PushChannel;
    if (!pushChannel) {
      res.status(500).json({ success: false, error: 'Push channel not initialized' });
      return;
    }
    
    await pushChannel.registerDeviceToken(user_id, device_token, device_type);
    
    res.json({ success: true, message: 'Device token registered successfully' });
  } catch (error: any) {
    logger.error('Failed to register device token:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/push/unregister
 * Unregister a device token
 */
router.post('/push/unregister', async (req: Request, res: Response) => {
  try {
    const { device_token } = req.body;
    
    if (!device_token) {
      res.status(400).json({ success: false, error: 'Missing device_token' });
      return;
    }
    
    const pushChannel = channelRegistry.get('push') as PushChannel;
    if (!pushChannel) {
      res.status(500).json({ success: false, error: 'Push channel not initialized' });
      return;
    }
    
    await pushChannel.unregisterDeviceToken(device_token);
    
    res.json({ success: true, message: 'Device token unregistered successfully' });
  } catch (error: any) {
    logger.error('Failed to unregister device token:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/config/push/tokens/:userId
 * Get device tokens for a user
 */
router.get('/push/tokens/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    
    const pushChannel = channelRegistry.get('push') as PushChannel;
    if (!pushChannel) {
      res.status(500).json({ success: false, error: 'Push channel not initialized' });
      return;
    }
    
    const tokens = await pushChannel.getDeviceTokens(userId);
    
    res.json({ success: true, tokens });
  } catch (error: any) {
    logger.error('Failed to get device tokens:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// AlertManager Integration
// ============================================================================

/**
 * POST /api/alertmanager/webhook
 * Receive alerts from Prometheus AlertManager and forward to email recipients
 */
router.post('/alertmanager/webhook', async (req: Request, res: Response) => {
  try {
    const alertPayload = req.body;
    
    logger.info('Received AlertManager webhook:', JSON.stringify(alertPayload).substring(0, 500));
    
    // Parse AlertManager payload
    const alerts = alertPayload.alerts || [];
    const status = alertPayload.status; // 'firing' or 'resolved'
    
    if (alerts.length === 0) {
      res.json({ success: true, message: 'No alerts to process' });
      return;
    }
    
    // Get enabled recipients from database
    const recipientsResult = await db.query(
      `SELECT email, name, severity_filter FROM alertmanager_recipients WHERE enabled = TRUE`
    );
    
    if (recipientsResult.rows.length === 0) {
      logger.warn('No AlertManager recipients configured');
      res.json({ success: true, message: 'No recipients configured' });
      return;
    }
    
    // Process each alert
    for (const alert of alerts) {
      const severity = alert.labels?.severity || 'info';
      const alertName = alert.labels?.alertname || 'Unknown Alert';
      const summary = alert.annotations?.summary || alertName;
      const description = alert.annotations?.description || 'No description';
      const alertStatus = alert.status || status; // 'firing' or 'resolved'
      
      // Filter recipients by severity
      const recipients = recipientsResult.rows.filter(r => 
        r.severity_filter === 'all' || r.severity_filter === severity
      );
      
      if (recipients.length === 0) {
        logger.debug(`No recipients for severity: ${severity}`);
        continue;
      }
      
      // Build email content
      const subject = `[${alertStatus.toUpperCase()}] ${severity.toUpperCase()}: ${alertName}`;
      const emailContent = `
Alert Status: ${alertStatus}
Severity: ${severity}
Alert: ${alertName}

Summary: ${summary}

Description: ${description}

Labels: ${JSON.stringify(alert.labels, null, 2)}

Time: ${new Date().toISOString()}
      `.trim();
      
      // Send email to each recipient via the email channel's system email method
      const emailChannel = channelRegistry.get('email') as any;
      if (emailChannel && typeof emailChannel.sendSystemEmail === 'function') {
        for (const recipient of recipients) {
          try {
            const result = await emailChannel.sendSystemEmail({
              to: recipient.email,
              subject: subject,
              text: emailContent,
              html: `<pre style="font-family: monospace; white-space: pre-wrap;">${emailContent}</pre>`,
            });
            
            if (result.success) {
              logger.info(`AlertManager notification sent to ${recipient.email}: ${alertName}`);
            } else {
              logger.error(`Failed to send alert email to ${recipient.email}: ${result.error}`);
            }
          } catch (emailError: any) {
            logger.error(`Failed to send alert email to ${recipient.email}:`, emailError);
          }
        }
      } else {
        logger.error('Email channel not available for AlertManager notifications');
      }
    }
    
    res.json({ success: true, message: `Processed ${alerts.length} alerts` });
  } catch (error: any) {
    logger.error('AlertManager webhook error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alertmanager/recipients
 * List AlertManager email recipients
 */
router.get('/alertmanager/recipients', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, email, name, severity_filter, enabled, created_at, updated_at 
       FROM alertmanager_recipients 
       ORDER BY id ASC`
    );
    
    res.json({ success: true, recipients: result.rows });
  } catch (error: any) {
    logger.error('Failed to list AlertManager recipients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/alertmanager/recipients
 * Add a new AlertManager recipient
 */
router.post('/alertmanager/recipients', async (req: Request, res: Response) => {
  try {
    const { email, name, severity_filter } = req.body;
    
    if (!email) {
      res.status(400).json({ success: false, error: 'Email is required' });
      return;
    }
    
    const result = await db.query(
      `INSERT INTO alertmanager_recipients (email, name, severity_filter)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, severity_filter, enabled`,
      [email, name || null, severity_filter || 'all']
    );
    
    logger.info(`Added AlertManager recipient: ${email}`);
    res.json({ success: true, recipient: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to add AlertManager recipient:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/alertmanager/recipients/:id
 * Update an AlertManager recipient
 */
router.put('/alertmanager/recipients/:id', async (req: Request, res: Response) => {
  try {
    const recipientId = parseInt(req.params.id);
    const { email, name, severity_filter, enabled } = req.body;
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (severity_filter !== undefined) {
      updates.push(`severity_filter = $${paramIndex++}`);
      values.push(severity_filter);
    }
    if (enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      values.push(enabled);
    }
    
    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'No fields to update' });
      return;
    }
    
    updates.push('updated_at = NOW()');
    values.push(recipientId);
    
    const result = await db.query(
      `UPDATE alertmanager_recipients SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Recipient not found' });
      return;
    }
    
    logger.info(`Updated AlertManager recipient: ${recipientId}`);
    res.json({ success: true, recipient: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to update AlertManager recipient:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/alertmanager/recipients/:id
 * Delete an AlertManager recipient
 */
router.delete('/alertmanager/recipients/:id', async (req: Request, res: Response) => {
  try {
    const recipientId = parseInt(req.params.id);
    
    const result = await db.query(
      'DELETE FROM alertmanager_recipients WHERE id = $1 RETURNING email',
      [recipientId]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Recipient not found' });
      return;
    }
    
    logger.info(`Deleted AlertManager recipient: ${result.rows[0].email}`);
    res.json({ success: true, message: 'Recipient deleted successfully' });
  } catch (error: any) {
    logger.error('Failed to delete AlertManager recipient:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Template Management Endpoints
// ============================================

/**
 * GET /api/config/templates
 * List all alarm templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const channel = req.query.channel as string | undefined;
    const templateType = req.query.template_type as string | undefined;
    
    let query = 'SELECT * FROM alarms_templates WHERE is_active = TRUE';
    const params: any[] = [];
    
    if (channel) {
      query += ` AND channel = $${params.length + 1}`;
      params.push(channel);
    }
    if (templateType) {
      query += ` AND template_type = $${params.length + 1}`;
      params.push(templateType);
    }
    
    query += ' ORDER BY channel, template_type, version DESC';
    
    const result = await db.query(query, params);
    res.json({ success: true, templates: result.rows });
  } catch (error: any) {
    logger.error('Failed to fetch templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/config/templates/:id
 * Get a specific template
 */
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    const result = await db.query('SELECT * FROM alarms_templates WHERE id = $1', [templateId]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
    
    res.json({ success: true, template: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to fetch template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/templates
 * Create a new template
 */
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const { name, channel, template_type, subject, body, variables, version } = req.body;
    
    if (!name || !channel || !template_type || !body) {
      res.status(400).json({ success: false, error: 'Missing required fields: name, channel, template_type, body' });
      return;
    }
    
    const result = await db.query(
      `INSERT INTO alarms_templates (name, channel, template_type, subject, body, variables, version, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING *`,
      [name, channel, template_type, subject || null, body, variables ? JSON.stringify(variables) : null, version || 1]
    );
    
    logger.info(`Created template: ${name} (${channel}:${template_type})`);
    res.json({ success: true, template: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to create template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/config/templates/:id
 * Update an existing template
 */
router.put('/templates/:id', async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    const { name, subject, body, variables, is_active } = req.body;
    
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (subject !== undefined) {
      updates.push(`subject = $${paramIndex++}`);
      params.push(subject);
    }
    if (body !== undefined) {
      updates.push(`body = $${paramIndex++}`);
      params.push(body);
    }
    if (variables !== undefined) {
      updates.push(`variables = $${paramIndex++}`);
      params.push(JSON.stringify(variables));
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }
    
    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'No fields to update' });
      return;
    }
    
    updates.push(`updated_at = NOW()`);
    params.push(templateId);
    
    const query = `UPDATE alarms_templates SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
    
    logger.info(`Updated template: ${result.rows[0].name}`);
    res.json({ success: true, template: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to update template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/config/templates/:id
 * Deactivate a template (soft delete)
 */
router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    const result = await db.query(
      'UPDATE alarms_templates SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *',
      [templateId]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
    
    logger.info(`Deactivated template: ${result.rows[0].name}`);
    res.json({ success: true, message: 'Template deactivated successfully' });
  } catch (error: any) {
    logger.error('Failed to delete template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Contacts Management Endpoints
// ============================================

/**
 * GET /api/config/contacts
 * List all alarm contacts
 */
router.get('/contacts', async (req: Request, res: Response) => {
  try {
    const imei = req.query.imei as string | undefined;
    const contactType = req.query.contact_type as string | undefined;
    const active = req.query.active as string | undefined;
    
    let query = 'SELECT * FROM alarms_contacts WHERE 1=1';
    const params: any[] = [];
    
    if (imei) {
      query += ` AND imei = $${params.length + 1}`;
      params.push(parseInt(imei));
    }
    if (contactType) {
      query += ` AND contact_type = $${params.length + 1}`;
      params.push(contactType);
    }
    if (active !== undefined) {
      query += ` AND active = $${params.length + 1}`;
      params.push(active === 'true');
    }
    
    query += ' ORDER BY imei, priority ASC, id ASC';
    
    const result = await db.query(query, params);
    res.json({ success: true, contacts: result.rows });
  } catch (error: any) {
    logger.error('Failed to fetch contacts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/config/contacts/:id
 * Get a specific contact
 */
router.get('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const contactId = parseInt(req.params.id);
    const result = await db.query('SELECT * FROM alarms_contacts WHERE id = $1', [contactId]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Contact not found' });
      return;
    }
    
    res.json({ success: true, contact: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to fetch contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/contacts
 * Create a new contact
 */
router.post('/contacts', async (req: Request, res: Response) => {
  try {
    const { 
      imei, contact_name, email, phone, contact_type, priority, active, 
      notes, quiet_hours_start, quiet_hours_end, timezone 
    } = req.body;
    
    if (!imei || !contact_name) {
      res.status(400).json({ success: false, error: 'Missing required fields: imei, contact_name' });
      return;
    }
    
    if (!email && !phone) {
      res.status(400).json({ success: false, error: 'At least email or phone is required' });
      return;
    }
    
    const result = await db.query(
      `INSERT INTO alarms_contacts 
       (imei, contact_name, email, phone, contact_type, priority, active, notes, quiet_hours_start, quiet_hours_end, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        imei, 
        contact_name, 
        email || null, 
        phone || null, 
        contact_type || 'primary', 
        priority || 1, 
        active !== false,
        notes || null,
        quiet_hours_start || null,
        quiet_hours_end || null,
        timezone || 'UTC'
      ]
    );
    
    logger.info(`Created contact: ${contact_name} for IMEI ${imei}`);
    res.json({ success: true, contact: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to create contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/config/contacts/:id
 * Update an existing contact
 */
router.put('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const contactId = parseInt(req.params.id);
    const { 
      imei, contact_name, email, phone, contact_type, priority, active, 
      notes, quiet_hours_start, quiet_hours_end, timezone 
    } = req.body;
    
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (imei !== undefined) {
      updates.push(`imei = $${paramIndex++}`);
      params.push(imei);
    }
    if (contact_name !== undefined) {
      updates.push(`contact_name = $${paramIndex++}`);
      params.push(contact_name);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      params.push(email || null);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      params.push(phone || null);
    }
    if (contact_type !== undefined) {
      updates.push(`contact_type = $${paramIndex++}`);
      params.push(contact_type);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(priority);
    }
    if (active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      params.push(active);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(notes || null);
    }
    if (quiet_hours_start !== undefined) {
      updates.push(`quiet_hours_start = $${paramIndex++}`);
      params.push(quiet_hours_start || null);
    }
    if (quiet_hours_end !== undefined) {
      updates.push(`quiet_hours_end = $${paramIndex++}`);
      params.push(quiet_hours_end || null);
    }
    if (timezone !== undefined) {
      updates.push(`timezone = $${paramIndex++}`);
      params.push(timezone);
    }
    
    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'No fields to update' });
      return;
    }
    
    updates.push(`updated_at = NOW()`);
    params.push(contactId);
    
    const query = `UPDATE alarms_contacts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Contact not found' });
      return;
    }
    
    logger.info(`Updated contact: ${result.rows[0].contact_name}`);
    res.json({ success: true, contact: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to update contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/config/contacts/:id
 * Delete a contact
 */
router.delete('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const contactId = parseInt(req.params.id);
    const result = await db.query(
      'DELETE FROM alarms_contacts WHERE id = $1 RETURNING contact_name',
      [contactId]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Contact not found' });
      return;
    }
    
    logger.info(`Deleted contact: ${result.rows[0].contact_name}`);
    res.json({ success: true, message: 'Contact deleted successfully' });
  } catch (error: any) {
    logger.error('Failed to delete contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/config/contacts/by-imei/:imei
 * Get contacts for a specific IMEI
 */
router.get('/contacts/by-imei/:imei', async (req: Request, res: Response) => {
  try {
    const imei = parseInt(req.params.imei);
    const activeOnly = req.query.active === 'true';
    
    let query = 'SELECT * FROM alarms_contacts WHERE imei = $1';
    if (activeOnly) {
      query += ' AND active = TRUE';
    }
    query += ' ORDER BY priority ASC, id ASC';
    
    const result = await db.query(query, [imei]);
    res.json({ success: true, contacts: result.rows });
  } catch (error: any) {
    logger.error('Failed to fetch contacts by IMEI:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
