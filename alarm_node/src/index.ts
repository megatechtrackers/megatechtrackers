import * as http from 'http';
import express from 'express';
import alarmProcessor from './services/alarmProcessor';
import logger from './utils/logger';
import metrics from './utils/metrics';
import config from './config';
import webhookHandler from './services/webhookHandler';
import featureFlags from './services/featureFlags';
import rateLimiter from './services/rateLimiter';
import templateVersioning from './services/templateVersioning';
import notificationListener from './services/notificationListener';
import dlqReprocessor from './services/dlqReprocessor';
import rabbitmqConsumer from './services/rabbitmqConsumer';
import channelRegistry from './channels';
import systemStateManager from './services/systemState';
import workerRegistry from './services/workerRegistry';

let server: http.Server | null = null;
let shutdownInProgress = false;

async function startHealthServer(): Promise<void> {
  const app = express();
  app.use(express.json());
  
  // Health endpoints
  // Dashboard UI
  app.get('/', (_req, res) => {
    const { getDashboardHTML } = require('./utils/dashboardGenerator');
    res.set('Content-Type', 'text/html');
    res.send(getDashboardHTML());
  });
  
  app.get('/dashboard', (_req, res) => {
    const { getDashboardHTML } = require('./utils/dashboardGenerator');
    res.set('Content-Type', 'text/html');
    res.send(getDashboardHTML());
  });
  
  app.get('/config', (_req, res) => {
    const { getConfigUIHTML } = require('./utils/configUIGenerator');
    res.set('Content-Type', 'text/html');
    res.send(getConfigUIHTML());
  });
  
  app.get('/health', (_req, res) => {
    const availableChannels = channelRegistry.getAvailableChannels();
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      availableChannels: availableChannels,
      channelsCount: availableChannels.length
    });
  });
  
  app.get('/ready', (_req, res) => {
    res.json({ ready: true, timestamp: new Date().toISOString() });
  });
  
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(await metrics.getMetrics());
  });
  
  // Feature flags endpoint
  app.get('/flags', (_req, res) => {
    res.json(featureFlags.getAllFlags());
  });
  
  app.post('/flags/:name/enable', async (req, res) => {
    try {
      await featureFlags.enable(req.params.name);
      res.json({ success: true, flag: req.params.name, enabled: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/flags/:name/disable', async (req, res) => {
    try {
      await featureFlags.disable(req.params.name);
      res.json({ success: true, flag: req.params.name, enabled: false });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Webhook endpoints (if enabled)
  if (featureFlags.isEnabled('webhooks_enabled')) {
    app.use('/webhooks', webhookHandler.getRouter());
  }
  
  // Configuration API endpoints
  const configurationRouter = await import('./routes/configuration');
  app.use('/api/config', configurationRouter.default);
  
  // DLQ reprocessing endpoints
  app.get('/dlq/stats', async (_req, res) => {
    try {
      const stats = await dlqReprocessor.getStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DLQ details endpoint - shows individual items with alarm type and IMEI
  app.get('/dlq/items', async (req, res) => {
    try {
      const channel = req.query.channel as string | undefined;
      const errorType = req.query.errorType as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const db = await import('./db');
      
      let query = `
        SELECT d.id, d.alarm_id, d.imei, d.channel, d.error_message, d.error_type,
               d.attempts, d.last_attempt_at, d.created_at, d.reprocessed,
               COALESCE(a.status, 'Unknown') as alarm_type,
               COALESCE(a.category, 'general') as alarm_category,
               a.latitude, a.longitude, a.speed, a.gps_time
        FROM alarms_dlq d
        LEFT JOIN alarms a ON d.alarm_id = a.id
        WHERE d.reprocessed = FALSE
      `;
      const params: any[] = [];
      
      if (channel) {
        params.push(channel);
        query += ` AND LOWER(d.channel) = LOWER($${params.length})`;
      }
      if (errorType) {
        params.push(errorType);
        query += ` AND LOWER(d.error_type) = LOWER($${params.length})`;
      }
      
      // Count total
      const countQuery = query.replace(/SELECT .* FROM/, 'SELECT COUNT(*) FROM');
      const countResult = await db.default.query(countQuery, params);
      const total = parseInt(countResult.rows[0]?.count || '0');
      
      // Get paginated results
      query += ` ORDER BY d.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      
      const result = await db.default.query(query, params);
      res.json({ success: true, items: serializeRows(result.rows as any[]), total });
    } catch (error: any) {
      logger.error('Failed to fetch DLQ items:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  app.post('/dlq/reprocess/:id', async (req, res) => {
    try {
      const dlqId = parseInt(req.params.id);
      const result = await dlqReprocessor.reprocessItem(dlqId);
      if (result.success) {
        res.json({ success: true, message: 'Item reprocessed successfully' });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/dlq/reprocess-batch', async (req, res) => {
    try {
      const filters = req.body || {};
      const result = await dlqReprocessor.reprocessBatch(filters);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Template versioning endpoints
  app.get('/templates/preview/:templateId', async (req, res) => {
    try {
      const templateId = parseInt(req.params.templateId);
      const testData = req.query.testData ? JSON.parse(req.query.testData as string) : undefined;
      const result = await templateVersioning.previewTemplate(templateId, testData);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/templates/rollback', async (req, res) => {
    try {
      const { channel, templateType, targetVersion } = req.body;
      if (!channel || !templateType || targetVersion === undefined) {
        res.status(400).json({ error: 'Missing required fields: channel, templateType, targetVersion' });
        return;
      }
      const success = await templateVersioning.rollbackTemplate(channel, templateType, targetVersion);
      if (success) {
        res.json({ success: true, message: `Template ${channel}:${templateType} rolled back to version ${targetVersion}` });
      } else {
        res.status(500).json({ error: 'Failed to rollback template' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Alarm lifecycle endpoints
  const alarmLifecycle = await import('./services/alarmLifecycle');
  app.post('/alarms/:id/cancel', async (req, res) => {
    try {
      const alarmId = parseInt(req.params.id);
      const reason = req.body.reason;
      const result = await alarmLifecycle.default.cancelAlarm(alarmId, reason);
      res.json({ success: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/alarms/:id/resolve', async (req, res) => {
    try {
      const alarmId = parseInt(req.params.id);
      const note = req.body.note;
      const result = await alarmLifecycle.default.resolveAlarm(alarmId, note);
      res.json({ success: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Alarm History endpoint - joins with alarms table to get alarm type (status)
  const db = await import('./db');
  /** Serialize DB rows for JSON: BigInt and Date break JSON.stringify */
  const serializeRows = (rows: any[]): any[] =>
    rows.map((row: any) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'bigint') out[k] = String(v);
        else if (v instanceof Date) out[k] = v.toISOString();
        else out[k] = v;
      }
      return out;
    });
  app.get('/api/alarms/history', async (req, res) => {
    try {
      const imei = req.query.imei as string | undefined;
      const status = req.query.status as string | undefined;
      const channel = req.query.channel as string | undefined;
      const alarmType = req.query.alarmType as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      let query = `
        SELECT h.id, h.imei, h.notification_type as channel, 
               COALESCE(a.status, 'Unknown') as alarm_type,
               COALESCE(a.category, 'general') as alarm_category,
               h.recipient, h.status, h.attempt_number as attempt_count, h.error_message, 
               h.sent_at as created_at, h.delivered_at as processed_at, h.alarm_id,
               a.latitude, a.longitude, a.speed
        FROM alarms_history h
        LEFT JOIN alarms a ON h.alarm_id = a.id
        WHERE 1=1
      `;
      const params: any[] = [];
      
      if (imei) {
        params.push(imei);
        query += ` AND h.imei::text LIKE $${params.length}`;
        params[params.length - 1] = `%${imei}%`;
      }
      if (status) {
        params.push(status);
        query += ` AND LOWER(h.status) = LOWER($${params.length})`;
      }
      if (channel) {
        params.push(channel);
        query += ` AND LOWER(h.notification_type) = LOWER($${params.length})`;
      }
      if (alarmType) {
        params.push(alarmType);
        query += ` AND LOWER(a.status) LIKE LOWER($${params.length})`;
        params[params.length - 1] = `%${alarmType}%`;
      }
      
      // Count total
      const countQuery = query.replace(/SELECT .* FROM/, 'SELECT COUNT(*) FROM');
      const countResult = await db.default.query(countQuery, params);
      const total = parseInt(countResult.rows[0]?.count || '0');
      
      // Get paginated results
      query += ` ORDER BY h.sent_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      
      const result = await db.default.query(query, params);
      res.json({ success: true, history: serializeRows(result.rows as any[]), total });
    } catch (error: any) {
      logger.error('Failed to fetch alarm history:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/alarms/:id/status', async (req, res) => {
    try {
      const alarmId = parseInt(req.params.id);
      const status = await alarmLifecycle.default.getAlarmStatus(alarmId);
      if (!status) {
        res.status(404).json({ error: 'Alarm not found' });
      } else {
        res.json(status);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Worker registry endpoints (uses static import from top)
  app.get('/workers', async (_req, res) => {
    try {
      const workers = await workerRegistry.getWorkers();
      res.json(workers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/workers/stats', async (_req, res) => {
    try {
      const stats = await workerRegistry.getWorkerStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Queue details endpoints - paused queue items with alarm details
  app.get('/queue/paused', async (_req, res) => {
    try {
      const pausedMessages = rabbitmqConsumer.getPausedMessages();
      const items = pausedMessages.map(msg => ({
        messageId: msg.messageId,
        imei: msg.alarm.imei,
        alarmType: msg.alarm.status,
        category: msg.alarm.category || 'general',
        latitude: msg.alarm.latitude,
        longitude: msg.alarm.longitude,
        speed: msg.alarm.speed,
        gpsTime: msg.alarm.gps_time,
        pausedAt: msg.pausedAt
      }));
      res.json({ 
        success: true, 
        count: items.length, 
        items 
      });
    } catch (error: any) {
      logger.error('Failed to fetch paused queue:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Bounce handler endpoints
  const bounceHandler = await import('./services/bounceHandler');
  app.get('/bounces/stats', async (_req, res) => {
    try {
      const stats = await bounceHandler.default.getBounceStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/bounces/process', async (req, res) => {
    try {
      const bounceInfo = req.body;
      await bounceHandler.default.processBounce(bounceInfo);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Circuit breaker management endpoints
  const alarmProcessor = await import('./services/alarmProcessor');
  app.post('/circuit-breakers/:channel/reset', async (req, res) => {
    try {
      const channel = req.params.channel as 'email' | 'sms' | 'voice';
      if (!['email', 'sms', 'voice'].includes(channel)) {
        res.status(400).json({ error: 'Invalid channel. Must be email, sms, or voice' });
        return;
      }
      await alarmProcessor.default.resetCircuitBreaker(channel);
      res.json({ success: true, message: `Circuit breaker for ${channel} reset` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/circuit-breakers/status', async (_req, res) => {
    try {
      const status = await alarmProcessor.default.getCircuitBreakerStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reprocess old alarms endpoint
  app.post('/alarms/reprocess-pending', async (req, res) => {
    try {
      const channel = req.body.channel as 'email' | 'sms' | 'voice' | 'all' | undefined;
      const limit = parseInt(req.body.limit as string) || 100;
      const result = await alarmProcessor.default.reprocessPendingAlarms(channel, limit);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

    const port = config.server.healthPort;
  server = app.listen(port, '0.0.0.0', () => {
    logger.info(`Server listening on port ${port} (0.0.0.0)`);
    logger.info(`  GET  /health             - Health check`);
    logger.info(`  GET  /ready              - Readiness check`);
    logger.info(`  GET  /metrics            - Prometheus metrics`);
    logger.info(`  GET  /flags              - Feature flags status`);
    logger.info(`  POST /flags/:name/enable - Enable feature flag`);
    logger.info(`  POST /flags/:name/disable- Disable feature flag`);
    logger.info(`  GET  /circuit-breakers/status - Get circuit breaker status`);
    logger.info(`  POST /circuit-breakers/:channel/reset - Reset circuit breaker (email/sms/voice)`);
    logger.info(`  POST /alarms/reprocess-pending - Reprocess pending alarms (channel: email/sms/voice/all, limit: number)`);
    logger.info(`  GET  /dlq/stats          - DLQ statistics`);
    logger.info(`  POST /dlq/reprocess/:id  - Reprocess single DLQ item`);
    logger.info(`  POST /dlq/reprocess-batch- Reprocess batch of DLQ items`);
    if (featureFlags.isEnabled('webhooks_enabled')) {
      logger.info(`  POST /webhooks/email/bounce  - Email bounce webhook`);
      logger.info(`  POST /webhooks/email/delivery- Email delivery webhook`);
      logger.info(`  POST /webhooks/sms/delivery  - SMS delivery webhook`);
    }
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shutdownInProgress) {
    logger.warn('Shutdown already in progress');
    return;
  }
  
  shutdownInProgress = true;
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    if (server) {
      server.close(() => {
        logger.info('Server closed');
      });
    }
    
    // Stop notification listener if enabled
    if (featureFlags.isEnabled('listen_notify_enabled')) {
      await notificationListener.stop();
    }
    
    // Stop automatic DLQ reprocessing
    dlqReprocessor.stopAutoReprocessing();
    
    // Stop RabbitMQ consumer
    try {
      await rabbitmqConsumer.stop();
      await rabbitmqConsumer.close();
      logger.info('RabbitMQ consumer stopped');
    } catch (error) {
      logger.error('Error stopping RabbitMQ consumer:', error);
    }
    
    // Shutdown services
    featureFlags.shutdown();
    templateVersioning.shutdown();
    workerRegistry.shutdown();
    await rateLimiter.close();
    await alarmProcessor.shutdown();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection:', { reason, promise });
});

async function main(): Promise<void> {
  try {
    logger.info('========================================');
    logger.info('Alarm Service Starting...');
    logger.info('========================================');
    logger.info('Configuration:');
    logger.info(`  Database: ${config.database.host}:${config.database.port}/${config.database.database}`);
    logger.info(`  Email: ${config.email.host}:${config.email.port}`);
    logger.info(`  SMS: ${config.sms.apiUrl ? 'Configured' : 'Not configured'}`);
    logger.info(`  Redis: ${process.env.REDIS_URL ? 'Configured' : 'Not configured'}`);
    logger.info(`  RabbitMQ: ${process.env.RABBITMQ_URL ? 'Configured' : 'NOT CONFIGURED - REQUIRED'}`);
    logger.info('========================================');
    
    // Initialize feature flags first
    await featureFlags.initialize();
    
    // Initialize rate limiter (Redis-based)
    if (featureFlags.isEnabled('rate_limiting_enabled')) {
      // Rate limiter initializes automatically on import
      logger.info('Rate limiting enabled (Redis-based)');
    }
    
    // Initialize template versioning service
    await templateVersioning.initialize();
    logger.info('Template versioning service initialized');
    
    // Initialize system state manager (MUST be before alarm processor for mock mode)
    await systemStateManager.initialize();
    logger.info('System state manager initialized', {
      mockSms: systemStateManager.isMockMode('sms'),
      mockEmail: systemStateManager.isMockMode('email')
    });
    
    // Initialize worker registry (tracks active workers for monitoring)
    await workerRegistry.initialize();
    logger.info('Worker registry initialized', { workerId: workerRegistry.getWorkerId() });
    
    // Initialize alarm processor
    await alarmProcessor.initialize();
    
    // Start health/webhook server
    await startHealthServer();
    
    // Start RabbitMQ consumer (primary processing method) with retry
    if (process.env.RABBITMQ_URL) {
      const maxStartupRetries = config.startup.maxRetries;
      let startupAttempt = 0;
      let connected = false;
      
      while (!connected && startupAttempt < maxStartupRetries) {
        startupAttempt++;
        try {
          logger.info(`Connecting to RabbitMQ (attempt ${startupAttempt}/${maxStartupRetries})...`);
          await rabbitmqConsumer.connect();
          await rabbitmqConsumer.start();
          connected = true;
          logger.info('RabbitMQ consumer started - processing alarms from queue');
        } catch (error: any) {
          logger.warn(`Failed to connect to RabbitMQ (attempt ${startupAttempt}/${maxStartupRetries}): ${error.message}`);
          if (startupAttempt < maxStartupRetries) {
            const delay = Math.min(config.startup.retryDelayBase * startupAttempt, config.startup.retryDelayMax);
            logger.info(`Retrying in ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      if (!connected) {
        logger.error('Failed to connect to RabbitMQ after maximum retries');
        logger.warn('Service will start anyway - RabbitMQ will auto-reconnect when available');
        // Don't throw - the reconnection mechanism will handle recovery
      }
    } else {
      logger.error('RABBITMQ_URL not configured - alarm processing requires RabbitMQ');
      throw new Error('RABBITMQ_URL environment variable is required');
    }
    
    // Start LISTEN/NOTIFY if enabled (optional, for additional triggers)
    if (featureFlags.isEnabled('listen_notify_enabled')) {
      await notificationListener.start();
      logger.info('Event-driven mode enabled (LISTEN/NOTIFY)');
    }
    
    // Start automatic DLQ reprocessing
    // This ensures failed notifications are automatically retried
    dlqReprocessor.startAutoReprocessing();
    logger.info('Automatic DLQ reprocessing enabled');
    
    // Automatically reset circuit breakers and reprocess pending alarms on startup
    // This ensures any alarms that were blocked by circuit breakers get processed
    if (config.autoReprocess.enabled) {
      logger.info('Auto-reprocessing enabled: Resetting circuit breakers and reprocessing pending alarms...');
      try {
        // Reset all circuit breakers to CLOSED state
        await alarmProcessor.resetAllCircuitBreakers();
        logger.info('Circuit breakers reset to CLOSED state');
        
        // Wait a moment for services to be fully ready
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Reprocess pending alarms (with delay to avoid overwhelming the system)
        const reprocessChannels: Array<'email' | 'sms' | 'voice'> = ['email', 'sms', 'voice'];
        const maxPerChannel = config.autoReprocess.startupLimit;
        
        for (const channel of reprocessChannels) {
          try {
            const result = await alarmProcessor.reprocessPendingAlarms(channel, maxPerChannel);
            if (result.processed > 0) {
              logger.info(`Reprocessed ${result.processed} pending ${channel} alarms on startup`);
            }
            if (result.failed > 0) {
              logger.warn(`Failed to reprocess ${result.failed} ${channel} alarms on startup`);
            }
            // Small delay between channels to avoid overwhelming
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error: any) {
            logger.warn(`Failed to reprocess pending ${channel} alarms on startup: ${error.message}`);
          }
        }
        logger.info('Startup reprocessing completed');
      } catch (error: any) {
        logger.warn(`Failed to reset circuit breakers or reprocess alarms on startup: ${error.message}`);
        // Don't fail startup if this fails - it's a recovery mechanism
      }
    } else {
      logger.info('Auto-reprocessing on startup disabled');
    }
    
    // Start periodic pending alarm reprocessing
    // This ensures any alarms that get stuck are eventually processed
    // This is a safety net in addition to startup reprocessing
    const periodicReprocessInterval = config.autoReprocess.periodicInterval;
    setInterval(async () => {
      try {
        logger.debug('Periodic pending alarm reprocessing check...');
        const reprocessChannels: Array<'email' | 'sms' | 'voice'> = ['email', 'sms', 'voice'];
        const maxPerChannel = config.autoReprocess.periodicLimit;
        
        for (const channel of reprocessChannels) {
          try {
            const result = await alarmProcessor.reprocessPendingAlarms(channel, maxPerChannel);
            if (result.processed > 0) {
              logger.info(`Periodic reprocessing: ${result.processed} pending ${channel} alarms processed`);
            }
            // Small delay between channels
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error: any) {
            logger.warn(`Periodic reprocessing failed for ${channel}: ${error.message}`);
          }
        }
      } catch (error: any) {
        logger.warn(`Periodic pending alarm reprocessing failed: ${error.message}`);
      }
    }, periodicReprocessInterval);
    logger.info(`Periodic pending alarm reprocessing enabled (every ${periodicReprocessInterval / 1000}s)`);
    
    // Self-healing: periodic DB cleanup (alarms_history, alarms_dlq, alarms_sms_modem_usage) - no manual intervention
    const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
    const runDbCleanup = async () => {
      try {
        const db = (await import('./db')).default;
        const firstCol = (row: any) => row && (row[Object.keys(row)[0]] ?? Object.values(row)[0]);
        const r1 = await db.query('SELECT cleanup_old_alarms_history(365)');
        const deletedHistory = Number(firstCol(r1.rows[0])) || 0;
        const r2 = await db.query('SELECT cleanup_old_alarms_dlq(90)');
        const deletedDlq = Number(firstCol(r2.rows[0])) || 0;
        const r3 = await db.query('SELECT cleanup_old_alarms_sms_modem_usage(730)');
        const deletedUsage = Number(firstCol(r3.rows[0])) || 0;
        if (deletedHistory > 0 || deletedDlq > 0 || deletedUsage > 0) {
          logger.info('DB cleanup completed', { deletedHistory, deletedDlq, deletedUsage });
        }
      } catch (e: any) {
        logger.warn('DB cleanup failed (will retry next interval)', { error: e.message });
      }
    };
    setTimeout(() => runDbCleanup(), 60 * 1000); // run once 1 min after startup
    setInterval(runDbCleanup, CLEANUP_INTERVAL_MS);
    logger.info('Periodic DB cleanup enabled (alarms_history 365d, dlq 90d, modem_usage 730d)');
    
    logger.info('Alarm Service is running');
    logger.info('Active Features:');
    const flags = featureFlags.getAllFlags();
    Object.entries(flags).forEach(([name, enabled]) => {
      if (enabled) {
        logger.info(`  ✓ ${name}`);
      }
    });
    logger.info('========================================');
  } catch (error) {
    logger.error('Failed to start Alarm Service:', error);
    process.exit(1);
  }
}

main();
