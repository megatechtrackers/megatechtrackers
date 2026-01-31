import db from '../db';
import logger from '../utils/logger';
import { validateContact } from '../utils/validation';
import { Alarm, Contact, Config } from '../types';

class AlarmRepository {
  async getDeviceContacts(imei: number | string, config: Config): Promise<Contact[]> {
    try {
      const contacts = await db.getDeviceContacts(imei);
      
      if (contacts.length === 0) {
        logger.warn(`No contacts configured for IMEI ${imei}. Using fallback.`);
        return [
          {
            email: config.fallback.email,
            phone: config.fallback.phone,
          }
        ];
      }
      
      const validatedContacts: Contact[] = [];
      for (const contact of contacts) {
        try {
          validatedContacts.push(validateContact(contact));
        } catch (error: any) {
          logger.warn(`Invalid contact for IMEI ${imei}:`, error?.message || error?.toString() || 'Unknown validation error', { contact });
        }
      }
      
      return validatedContacts.length > 0 ? validatedContacts : [
        {
          email: config.fallback.email,
          phone: config.fallback.phone,
        }
      ];
    } catch (error: any) {
      logger.error(`Error fetching contacts for IMEI ${imei}:`, error.message);
      return [
        {
          email: config.fallback.email,
          phone: config.fallback.phone,
        }
      ];
    }
  }

  async shouldDeduplicate(alarm: Alarm, windowMinutes: number): Promise<boolean> {
    const dedup = await db.checkDeduplication(alarm.imei, alarm.status, windowMinutes);
    if (dedup && dedup.notification_sent) {
      logger.info(`Alarm deduplicated for IMEI ${alarm.imei}, status ${alarm.status}`, {
        occurrence_count: dedup.occurrence_count
      });
      return true;
    }
    return false;
  }

  async markDeduplication(alarm: Alarm): Promise<void> {
    await db.updateDeduplication(alarm.imei, alarm.status);
  }

  async isInQuietHours(imei: number | string): Promise<boolean> {
    return await db.isInQuietHours(imei);
  }

  async markNotificationSent(alarmId: number | string, channel: string): Promise<void> {
    if (channel === 'email') {
      await db.markEmailSent(alarmId);
    } else if (channel === 'sms') {
      await db.markSmsSent(alarmId);
    } else if (channel === 'voice') {
      await db.markCallSent(alarmId);
    }
  }

  async recordAttempt(
    alarmId: number | string,
    imei: number | string,
    gpsTime: Date,
    channel: string,
    recipient: string,
    status: string,
    errorMessage: string | null,
    providerMessageId: string | null,
    providerName: string | null,
    modemId: number | null = null,
    modemName: string | null = null
  ): Promise<void> {
    await db.recordNotificationAttempt(
      alarmId, imei, gpsTime, channel, recipient,
      status, errorMessage, null,
      providerMessageId, providerName,
      modemId, modemName
    );
  }

  async addToDLQ(
    alarm: Alarm,
    channel: string,
    errorMessage: string,
    errorType: string,
    attempts: number
  ): Promise<void> {
    await db.addToDLQ(alarm, channel, errorMessage, errorType, attempts);
  }
}

export default new AlarmRepository();
