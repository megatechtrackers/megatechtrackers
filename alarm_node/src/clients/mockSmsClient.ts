import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

/**
 * Mock SMS Server Client
 * Simple HTTP client for the mock SMS server
 */

export interface MockSmsConfig {
  apiUrl: string;
  apiKey: string;
}

export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class MockSmsClient {
  private apiUrl: string;
  private apiKey: string;
  private axiosInstance: AxiosInstance;

  constructor(config: MockSmsConfig) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;

    this.axiosInstance = axios.create({
      timeout: 10000,
    });
  }

  /**
   * Send SMS via mock server
   */
  async sendSms(phoneNumber: string, message: string, from: string = 'AlarmService'): Promise<SendSmsResult> {
    try {
      const response = await this.axiosInstance.post(
        this.apiUrl,
        {
          to: phoneNumber,
          from: from,
          message: message,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 200 && response.data.success) {
        const messageId = response.data.message_id;
        logger.debug(`Mock SMS sent: ${phoneNumber}`);
        return { success: true, messageId };
      }

      return { success: false, error: 'Mock SMS send failed' };
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message;
      logger.error(`Mock SMS send error:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const healthUrl = this.apiUrl.replace(/\/sms\/send$/, '/health');
      const response = await this.axiosInstance.get(healthUrl, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get mock server info
   */
  getInfo(): { apiUrl: string } {
    return {
      apiUrl: this.apiUrl,
    };
  }
}

export default MockSmsClient;
