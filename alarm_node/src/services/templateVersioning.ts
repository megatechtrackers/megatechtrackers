import db from '../db';
import logger from '../utils/logger';
import config from '../config';
import configurationService from './configurationService';
import { Alarm } from '../types';
import Handlebars from 'handlebars';
// @ts-ignore - mjml doesn't have type definitions
import mjml from 'mjml';

/**
 * Template Versioning Service
 * 
 * Manages versioned templates with A/B testing support
 * Supports Handlebars and MJML templates
 */
interface Template {
  id: number;
  name: string;
  channel: 'email' | 'sms' | 'voice';
  template_type: string;
  subject?: string;
  body: string;
  version: number;
  is_active: boolean;
  variables: Record<string, any>;
}

interface TemplateTestResult {
  templateId: number;
  templateName: string;
  rendered: string;
  variables: Record<string, any>;
  errors?: string[];
}

class TemplateVersioningService {
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();
  private activeTemplates: Map<string, Template[]> = new Map(); // key: "channel:type", value: templates
  private cacheRefreshInterval: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    await this.loadTemplates();
    
    // Refresh templates every 5 minutes
    this.cacheRefreshInterval = setInterval(() => {
      this.loadTemplates().catch(error => {
        logger.error('Error refreshing templates:', error);
      });
    }, config.templateVersioning.refreshInterval);
    
    logger.info('Template versioning service initialized');
  }

  private async loadTemplates(): Promise<void> {
    try {
      const query = `
        SELECT id, name, channel, template_type, subject, body, version, 
               is_active, variables
        FROM alarms_templates
        WHERE is_active = TRUE
        ORDER BY name, channel, version DESC
      `;
      
      const result = await db.query(query);
      this.activeTemplates.clear();
      this.templateCache.clear();
      
      for (const row of result.rows) {
        const key = `${row.channel}:${row.template_type}`;
        if (!this.activeTemplates.has(key)) {
          this.activeTemplates.set(key, []);
        }
        this.activeTemplates.get(key)!.push(row);
        
        // Compile template
        try {
          const compiled = Handlebars.compile(row.body);
          const cacheKey = `${row.channel}:${row.template_type}:${row.version}`;
          this.templateCache.set(cacheKey, compiled);
        } catch (error: any) {
          logger.error(`Error compiling template ${row.name} v${row.version}:`, error);
        }
      }
      
      logger.debug(`Loaded ${result.rows.length} active templates`);
    } catch (error: any) {
      if (error.code === '42P01') {
        // Table doesn't exist yet, that's okay
        logger.warn('alarms_templates table does not exist yet');
      } else {
        logger.error('Error loading templates:', error);
      }
    }
  }

  /**
   * Get template for channel and type, with A/B testing support
   */
  async getTemplate(
    channel: 'email' | 'sms' | 'voice',
    templateType: string,
    alarm?: Alarm
  ): Promise<Template | null> {
    const key = `${channel}:${templateType}`;
    const templates = this.activeTemplates.get(key);
    
    if (!templates || templates.length === 0) {
      return null;
    }

    // A/B testing: select template based on alarm ID hash for consistency
    if (templates.length > 1 && alarm) {
      const hash = this.hashAlarmId(alarm.id);
      const selectedIndex = hash % templates.length;
      return templates[selectedIndex];
    }

    // Return latest version
    return templates[0];
  }

  /**
   * Render template with alarm data
   */
  async renderTemplate(
    channel: 'email' | 'sms' | 'voice',
    templateType: string,
    alarm: Alarm,
    useVersion?: number
  ): Promise<{ subject?: string; body: string }> {
    const template = await this.getTemplate(channel, templateType, alarm);
    
    if (!template) {
      throw new Error(`Template not found: ${channel}:${templateType}`);
    }

    // Use specific version if requested
    if (useVersion !== undefined) {
      const key = `${channel}:${templateType}`;
      const templates = this.activeTemplates.get(key);
      const versionedTemplate = templates?.find(t => t.version === useVersion);
      if (versionedTemplate) {
        return this.renderTemplateData(versionedTemplate, alarm);
      }
    }

    return this.renderTemplateData(template, alarm);
  }

  private async renderTemplateData(template: Template, alarm: Alarm): Promise<{ subject?: string; body: string }> {
    const context = await this.buildTemplateContext(alarm);
    
    // Compile and render body
    const cacheKey = `${template.channel}:${template.template_type}:${template.version}`;
    let compiled = this.templateCache.get(cacheKey);
    
    if (!compiled) {
      compiled = Handlebars.compile(template.body);
      this.templateCache.set(cacheKey, compiled);
    }
    
    let body = compiled(context);
    
    // Convert MJML to HTML for email templates
    if (template.channel === 'email' && template.body.includes('<mjml>')) {
      try {
        const mjmlResult = mjml(body);
        body = mjmlResult.html;
      } catch (error: any) {
        logger.error('Error converting MJML to HTML:', error);
        // Fall back to original body
      }
    }
    
    // Render subject if present
    let subject: string | undefined;
    if (template.subject) {
      const subjectCompiled = Handlebars.compile(template.subject);
      subject = subjectCompiled(context);
    }
    
    return { subject, body };
  }

  private async buildTemplateContext(alarm: Alarm): Promise<Record<string, any>> {
    // Format dates for email display. Use display_timezone from DB (Email Settings), else env, else UTC.
    let tz = config.email.displayTimezone || 'UTC';
    try {
      const emailConfig = await configurationService.getChannelConfigByMode('email', false);
      if (emailConfig.display_timezone) tz = emailConfig.display_timezone;
    } catch {
      // keep env/UTC fallback
    }
    const formatDate = (date: Date | string | undefined): string => {
      if (!date) return '';
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleString('en-US', { timeZone: tz });
    };

    return {
      // Root-level properties for backward compatibility with existing templates
      id: alarm.id,
      imei: alarm.imei,
      status: alarm.status,
      latitude: alarm.latitude,
      longitude: alarm.longitude,
      speed: alarm.speed,
      altitude: alarm.altitude,
      angle: alarm.angle,
      satellites: alarm.satellites,
      server_time: formatDate(alarm.server_time),
      gps_time: formatDate(alarm.gps_time),
      distance: alarm.distance,
      reference_id: alarm.reference_id,
      // Nested alarm object for new templates
      alarm: {
        id: alarm.id,
        imei: alarm.imei,
        status: alarm.status,
        latitude: alarm.latitude,
        longitude: alarm.longitude,
        speed: alarm.speed,
        altitude: alarm.altitude,
        angle: alarm.angle,
        satellites: alarm.satellites,
        serverTime: formatDate(alarm.server_time),
        gpsTime: formatDate(alarm.gps_time),
        distance: alarm.distance,
        state: alarm.state || {},
      },
      maps: {
        google: `https://maps.google.com/?q=${alarm.latitude},${alarm.longitude}`,
        osm: `https://www.openstreetmap.org/?mlat=${alarm.latitude}&mlon=${alarm.longitude}`,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Preview template with test data
   */
  async rollbackTemplate(
    channel: 'email' | 'sms' | 'voice',
    templateType: string,
    targetVersion: number
  ): Promise<boolean> {
    try {
      const query = `
        UPDATE alarms_templates
        SET is_active = FALSE
        WHERE channel = $1 AND template_type = $2 AND version > $3;
        
        UPDATE alarms_templates
        SET is_active = TRUE
        WHERE channel = $1 AND template_type = $2 AND version = $3;
      `;
      
      await db.query(query, [channel, templateType, targetVersion]);
      await this.loadTemplates(); // Reload templates
      
      logger.info(`Rolled back template ${channel}:${templateType} to version ${targetVersion}`);
      return true;
    } catch (error) {
      logger.error(`Error rolling back template ${channel}:${templateType}:`, error);
      return false;
    }
  }
  
  async previewTemplate(
    templateId: number,
    testData?: Record<string, any>
  ): Promise<TemplateTestResult> {
    try {
      const query = `
        SELECT id, name, channel, template_type, subject, body, version, variables
        FROM alarms_templates
        WHERE id = $1
      `;
      
      const result = await db.query(query, [templateId]);
      
      if (result.rows.length === 0) {
        throw new Error(`Template ${templateId} not found`);
      }
      
      const template = result.rows[0];
      const testAlarm: Alarm = testData ? this.createTestAlarm(testData) : this.createDefaultTestAlarm();
      
      const rendered = await this.renderTemplateData(template, testAlarm);
      
      return {
        templateId: template.id,
        templateName: template.name,
        rendered: rendered.body,
        variables: template.variables || {},
      };
    } catch (error: any) {
      logger.error(`Error previewing template ${templateId}:`, error);
      return {
        templateId,
        templateName: '',
        rendered: '',
        variables: {},
        errors: [error.message],
      };
    }
  }

  private createTestAlarm(data: Record<string, any>): Alarm {
    return {
      id: data.id || 999999,
      imei: data.imei || 123456789012345,
      status: data.status || 'Test Alarm',
      latitude: data.latitude || 40.7128,
      longitude: data.longitude || -74.0060,
      speed: data.speed || 60,
      server_time: new Date(),
      gps_time: new Date(),
      altitude: 0,
      angle: 0,
      satellites: 0,
      is_valid: 1,
      is_sms: 0,
      is_email: 0,
      is_call: 0,
      sms_sent: false,
      email_sent: false,
      state: data.state || {},
    };
  }

  private createDefaultTestAlarm(): Alarm {
    return this.createTestAlarm({});
  }

  /**
   * Hash alarm ID for A/B testing consistency
   */
  private hashAlarmId(id: number | string): number {
    const str = String(id);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  shutdown(): void {
    if (this.cacheRefreshInterval) {
      clearInterval(this.cacheRefreshInterval);
      this.cacheRefreshInterval = null;
    }
    this.templateCache.clear();
    this.activeTemplates.clear();
    logger.info('Template versioning service shut down');
  }
}

export default new TemplateVersioningService();
