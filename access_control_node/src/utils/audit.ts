import { logger } from './logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { AuditLogEntry } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIT_LOG_DIR = path.join(__dirname, '../../logs/audit');
const MAX_LOG_AGE_DAYS = 90; // Keep logs for 90 days

/**
 * Audit log for security and compliance
 */
export async function auditLog(entry: Partial<AuditLogEntry>): Promise<void> {
  const auditEntry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    action: entry.action || 'unknown',
    user: entry.user || 'unknown',
    reportId: entry.reportId,
    reportUid: entry.reportUid,
    clientIp: entry.clientIp || 'unknown',
    success: entry.success ?? false,
    error: entry.error || undefined
  };

  // Log to Winston
  logger.info('Audit log', auditEntry);

  // Write to audit log file
  try {
    await fs.mkdir(AUDIT_LOG_DIR, { recursive: true });
    const logFile = path.join(AUDIT_LOG_DIR, `audit-${new Date().toISOString().split('T')[0]}.log`);
    await fs.appendFile(logFile, JSON.stringify(auditEntry) + '\n');
    
    // Rotate old log files (run cleanup periodically, not on every log)
    // Only cleanup 1% of the time to avoid performance impact
    if (Math.random() < 0.01) {
      rotateOldLogs().catch(err => {
        logger.error('Failed to rotate audit logs', { 
          error: err instanceof Error ? err.message : String(err)
        });
      });
    }
  } catch (err) {
    logger.error('Failed to write audit log', { 
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * Rotate old audit log files (delete logs older than MAX_LOG_AGE_DAYS)
 */
async function rotateOldLogs(): Promise<void> {
  try {
    const files = await fs.readdir(AUDIT_LOG_DIR);
    const now = Date.now();
    const maxAge = MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000; // Convert to milliseconds
    
    for (const file of files) {
      if (!file.startsWith('audit-') || !file.endsWith('.log')) {
        continue;
      }
      
      const filePath = path.join(AUDIT_LOG_DIR, file);
      const stats = await fs.stat(filePath);
      const fileAge = now - stats.mtime.getTime();
      
      if (fileAge > maxAge) {
        await fs.unlink(filePath);
        logger.info('Rotated old audit log file', { file });
      }
    }
  } catch (err) {
    // Ignore errors during rotation
    logger.warn('Error during audit log rotation', { 
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
