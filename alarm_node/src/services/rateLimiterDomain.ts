import logger from '../utils/logger';
import metrics from '../utils/metrics';

/**
 * Per-Domain Rate Limiter
 * 
 * Implements rate limiting per email domain (Gmail, Outlook, etc.)
 * to prevent hitting provider-specific limits
 */
class DomainRateLimiter {
  private domainLimits: Map<string, { perMinute: number; perHour: number; perDay: number }> = new Map();
  private domainCounts: Map<string, { minute: number[]; hour: number[]; day: number[] }> = new Map();

  constructor() {
    // Default limits per domain
    this.domainLimits.set('gmail.com', { perMinute: 20, perHour: 200, perDay: 2000 });
    this.domainLimits.set('outlook.com', { perMinute: 30, perHour: 300, perDay: 3000 });
    this.domainLimits.set('hotmail.com', { perMinute: 30, perHour: 300, perDay: 3000 });
    this.domainLimits.set('yahoo.com', { perMinute: 25, perHour: 250, perDay: 2500 });
    this.domainLimits.set('default', { perMinute: 20, perHour: 200, perDay: 2000 });
  }

  /**
   * Extract domain from email address
   */
  private extractDomain(email: string): string {
    const parts = email.split('@');
    return parts.length > 1 ? parts[1].toLowerCase() : 'unknown';
  }

  /**
   * Check if email can be sent to domain
   */
  async canSend(email: string): Promise<boolean> {
    const domain = this.extractDomain(email);
    const limits = this.domainLimits.get(domain) || this.domainLimits.get('default')!;
    
    // Get or initialize counts
    if (!this.domainCounts.has(domain)) {
      this.domainCounts.set(domain, {
        minute: [],
        hour: [],
        day: [],
      });
    }
    
    const counts = this.domainCounts.get(domain)!;
    const now = Date.now();
    
    // Clean old timestamps
    counts.minute = counts.minute.filter(ts => now - ts < 60000);
    counts.hour = counts.hour.filter(ts => now - ts < 3600000);
    counts.day = counts.day.filter(ts => now - ts < 86400000);
    
    // Check limits
    if (counts.minute.length >= limits.perMinute) {
      metrics.incrementCounter('domain_rate_limit_exceeded');
      return false;
    }
    
    if (counts.hour.length >= limits.perHour) {
      metrics.incrementCounter('domain_rate_limit_exceeded');
      return false;
    }
    
    if (counts.day.length >= limits.perDay) {
      metrics.incrementCounter('domain_rate_limit_exceeded');
      return false;
    }
    
    return true;
  }

  /**
   * Record email send to domain
   */
  recordSend(email: string): void {
    const domain = this.extractDomain(email);
    
    if (!this.domainCounts.has(domain)) {
      this.domainCounts.set(domain, {
        minute: [],
        hour: [],
        day: [],
      });
    }
    
    const counts = this.domainCounts.get(domain)!;
    const now = Date.now();
    
    counts.minute.push(now);
    counts.hour.push(now);
    counts.day.push(now);
    
    metrics.incrementCounter('domain_email_sent');
  }

  /**
   * Get domain statistics
   */
  getDomainStats(domain: string): {
    perMinute: number;
    perHour: number;
    perDay: number;
    limits: { perMinute: number; perHour: number; perDay: number };
  } {
    const limits = this.domainLimits.get(domain) || this.domainLimits.get('default')!;
    const counts = this.domainCounts.get(domain);
    
    if (!counts) {
      return {
        perMinute: 0,
        perHour: 0,
        perDay: 0,
        limits,
      };
    }
    
    const now = Date.now();
    const minute = counts.minute.filter(ts => now - ts < 60000).length;
    const hour = counts.hour.filter(ts => now - ts < 3600000).length;
    const day = counts.day.filter(ts => now - ts < 86400000).length;
    
    return {
      perMinute: minute,
      perHour: hour,
      perDay: day,
      limits,
    };
  }

  /**
   * Configure domain limits
   */
  setDomainLimits(domain: string, limits: { perMinute: number; perHour: number; perDay: number }): void {
    this.domainLimits.set(domain.toLowerCase(), limits);
    logger.info(`Updated rate limits for domain ${domain}`, limits);
  }
}

export default new DomainRateLimiter();
