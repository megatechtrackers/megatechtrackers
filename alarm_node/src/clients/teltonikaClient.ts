import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import * as tls from 'tls';
import * as crypto from 'crypto';
import logger from '../utils/logger';

/**
 * Teltonika RUT200 SMS API Client
 * Ported from Python client
 */

export interface TeltonikaConfig {
  url: string;
  username: string;
  password: string;
  certFingerprint?: string;
  requireCertVerification?: boolean;
}

export interface SendSmsResult {
  success: boolean;
  smsUsed?: number;
  error?: string;
  quotaExhausted?: boolean;  // TRUE if SMS failed due to quota/limit reached
  errorCode?: number;        // Teltonika error code if available
}

export class TeltonikaClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private certFingerprint?: string;
  private requireCertVerification: boolean;
  private token: string | null = null;
  private tokenTimestamp: number | null = null;
  private axiosInstance: AxiosInstance;
  private useHttps: boolean;
  private hostname: string;
  private loginInProgress: boolean = false;
  private readonly TOKEN_EXPIRY_MS = 3600000; // 1 hour (assuming Teltonika token expiry)

  constructor(config: TeltonikaConfig) {
    // Normalize URL
    this.baseUrl = config.url.replace(/\/+$/, '').replace(/\/api$/, '') + '/api';
    this.username = config.username;
    this.password = config.password;
    this.certFingerprint = config.certFingerprint?.toUpperCase().replace(/[:\s]/g, '');
    this.requireCertVerification = config.requireCertVerification || false;
    this.useHttps = this.baseUrl.startsWith('https://');
    this.hostname = this.extractHostname(this.baseUrl);

    // Create axios instance with custom settings
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      httpsAgent: this.useHttps ? new https.Agent({
        rejectUnauthorized: false, // Accept self-signed certs
      }) : undefined,
    });
  }

  /**
   * Extract hostname from URL
   */
  private extractHostname(url: string): string {
    const match = url.match(/^https?:\/\/([^:/]+)/);
    return match ? match[1] : url;
  }

  /**
   * Get certificate fingerprint from server
   */
  private async getCertificateFingerprint(hostname: string, port: number = 443): Promise<string | null> {
    return new Promise((resolve) => {
      let socket: tls.TLSSocket | null = null;
      const timeout = setTimeout(() => {
        if (socket) socket.destroy();
        resolve(null);
      }, 10000); // 10 second timeout
      
      try {
        const options: tls.ConnectionOptions = {
          host: hostname,
          port: port,
          rejectUnauthorized: false,
          servername: hostname,
        };
        
        socket = tls.connect(options, () => {
          try {
            clearTimeout(timeout);
            if (!socket) {
              resolve(null);
              return;
            }
            
            const cert = socket.getPeerCertificate(true);
            if (cert && cert.raw) {
              const fingerprint = crypto
                .createHash('sha256')
                .update(cert.raw)
                .digest('hex')
                .toUpperCase()
                .match(/.{2}/g)
                ?.join(':') || null;
              
              socket.destroy();
              resolve(fingerprint);
            } else {
              socket.destroy();
              resolve(null);
            }
          } catch (error) {
            if (socket) socket.destroy();
            resolve(null);
          }
        });

        socket.on('error', (err) => {
          clearTimeout(timeout);
          logger.debug(`TLS connection error to ${hostname}: ${err.message}`);
          if (socket) socket.destroy();
          resolve(null);
        });
      } catch (error) {
        clearTimeout(timeout);
        if (socket) socket.destroy();
        resolve(null);
      }
    });
  }

  /**
   * Verify certificate fingerprint
   */
  private async verifyCertificateFingerprint(hostname: string, port: number = 443): Promise<boolean> {
    if (!this.certFingerprint) {
      return true; // No fingerprint to verify
    }

    const actual = await this.getCertificateFingerprint(hostname, port);
    if (!actual) {
      logger.warn(`Could not retrieve certificate fingerprint from ${hostname}`);
      return false;
    }

    const expected = this.certFingerprint.replace(/[:\s]/g, '');
    const actualNormalized = actual.replace(/[:\s]/g, '');

    if (expected === actualNormalized) {
      logger.debug(`Certificate fingerprint verified: ${actual}`);
      return true;
    } else {
      logger.error(`Certificate fingerprint mismatch!`);
      logger.error(`  Expected: ${this.certFingerprint}`);
      logger.error(`  Actual: ${actual}`);
      return false;
    }
  }

  /**
   * Check if token is still valid (not expired)
   */
  private isTokenValid(): boolean {
    if (!this.token || !this.tokenTimestamp) {
      return false;
    }
    
    const age = Date.now() - this.tokenTimestamp;
    return age < this.TOKEN_EXPIRY_MS;
  }

  /**
   * Login and get authentication token
   * This is called internally and handles concurrent login attempts
   */
  async login(): Promise<boolean> {
    // Prevent concurrent login attempts
    if (this.loginInProgress) {
      logger.debug(`Login already in progress for ${this.hostname}, waiting...`);
      // Wait for the ongoing login to complete
      let attempts = 0;
      while (this.loginInProgress && attempts < 30) { // Wait max 3 seconds
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      return this.isTokenValid();
    }

    // Check if we already have a valid token
    if (this.isTokenValid()) {
      logger.debug(`Using cached token for ${this.hostname}`);
      return true;
    }

    this.loginInProgress = true;
    
    try {
      // Verify certificate fingerprint if HTTPS and fingerprint provided
      if (this.useHttps && this.certFingerprint) {
        logger.debug('Verifying certificate fingerprint...');
        const verified = await this.verifyCertificateFingerprint(this.hostname);
        
        if (!verified && this.requireCertVerification) {
          logger.error('Certificate fingerprint mismatch and verification is required!');
          return false;
        } else if (!verified) {
          logger.warn('Certificate fingerprint mismatch! Connection may be insecure.');
        }
      }

      // Login request
      const response = await this.axiosInstance.post('/login', {
        username: this.username,
        password: this.password,
      });

      if (response.status === 200 && response.data.success) {
        this.token = response.data.data?.token;
        if (this.token) {
          this.tokenTimestamp = Date.now();
          logger.info(`Teltonika login successful: ${this.hostname}`);
          return true;
        }
      }

      logger.error('Teltonika login failed: No token received');
      return false;
    } catch (error: any) {
      logger.error(`Teltonika login error (${this.hostname}):`, error.message);
      return false;
    } finally {
      this.loginInProgress = false;
    }
  }

  /**
   * Ensure we have a valid login session
   * Call this once after creating the client to establish initial session
   */
  async ensureLoggedIn(): Promise<boolean> {
    if (this.isTokenValid()) {
      return true;
    }
    return await this.login();
  }

  /**
   * Clear the current session token
   */
  clearSession(): void {
    this.token = null;
    this.tokenTimestamp = null;
    logger.debug(`Session cleared for ${this.hostname}`);
  }

  /**
   * Send SMS via Teltonika API
   * Uses persistent session - only logs in if needed
   */
  async sendSms(phoneNumber: string, message: string, modemId: string = '1-1'): Promise<SendSmsResult> {
    try {
      // Ensure we're logged in (checks cache first)
      const loginSuccess = await this.ensureLoggedIn();
      if (!loginSuccess) {
        return { success: false, error: 'Login failed' };
      }

      // Send SMS request with cached token
      const response = await this.axiosInstance.post(
        '/messages/actions/send',
        {
          data: {
            number: phoneNumber,
            message: message,
            modem: modemId,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
          },
        }
      );

      if (response.status === 200 && response.data.success) {
        const smsUsed = response.data.data?.sms_used || 1;
        logger.info(`SMS sent via Teltonika (${this.hostname}): ${phoneNumber}, segments: ${smsUsed}`);
        return { success: true, smsUsed };
      }

      return { success: false, error: 'SMS send failed' };
    } catch (error: any) {
      // Handle auth errors - clear session and retry once
      if (error.response?.status === 401 && this.token) {
        logger.warn(`Token expired for ${this.hostname}, re-authenticating...`);
        this.clearSession();
        
        // Retry once with fresh login
        const retryLoginSuccess = await this.ensureLoggedIn();
        if (!retryLoginSuccess) {
          return { success: false, error: 'Re-authentication failed' };
        }
        
        // Retry the SMS send
        try {
          const retryResponse = await this.axiosInstance.post(
            '/messages/actions/send',
            {
              data: {
                number: phoneNumber,
                message: message,
                modem: modemId,
              },
            },
            {
              headers: {
                'Authorization': `Bearer ${this.token}`,
              },
            }
          );
          
          if (retryResponse.status === 200 && retryResponse.data.success) {
            const smsUsed = retryResponse.data.data?.sms_used || 1;
            logger.info(`SMS sent via Teltonika after retry (${this.hostname}): ${phoneNumber}`);
            return { success: true, smsUsed };
          }
        } catch (retryError: any) {
          const retryErrorMsg = retryError.response?.data?.error || retryError.message;
          logger.error(`Teltonika SMS send retry error (${this.hostname}):`, retryErrorMsg);
          return { success: false, error: retryErrorMsg };
        }
      }

      const errorMsg = error.response?.data?.error || error.message;
      const errorCode = error.response?.data?.code;
      const quotaExhausted = this.isQuotaError(error.response?.data);
      
      logger.error(`Teltonika SMS send error (${this.hostname}):`, errorMsg);
      
      if (quotaExhausted) {
        logger.warn(`Quota exhausted detected for ${this.hostname}`);
      }
      
      return { 
        success: false, 
        error: errorMsg, 
        quotaExhausted,
        errorCode 
      };
    }
  }

  /**
   * Check if error response indicates quota/limit exhaustion
   * Looks for keywords in error message that suggest SMS limit reached
   */
  private isQuotaError(responseData: any): boolean {
    if (!responseData) return false;
    
    const errorStr = JSON.stringify(responseData).toLowerCase();
    const quotaKeywords = [
      'quota',
      'limit',
      'credit',
      'insufficient',
      'exceeded',
      'exhausted',
      'barred',
      'blocked',
      'sms_limit',
      'maximum',
      'allowance',
    ];
    
    return quotaKeywords.some(keyword => errorStr.includes(keyword));
  }

  /**
   * Health check - uses /session/status to verify session is alive
   * This also resets the session timer on Teltonika
   */
  async healthCheck(): Promise<boolean> {
    try {
      // If we have a valid token, verify session is still alive
      if (this.isTokenValid()) {
        try {
          // Use /session/status endpoint - this keeps session alive
          const response = await this.axiosInstance.get('/session/status', {
            headers: { 'Authorization': `Bearer ${this.token}` },
            timeout: 5000,
          });
          
          if (response.data?.success === true) {
            logger.debug(`Session alive for ${this.hostname}`);
            return true;
          }
          
          // Session might have expired on server side
          logger.debug(`Session expired for ${this.hostname}, will re-login`);
          this.clearSession();
        } catch (error: any) {
          // Connection issues
          if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
            logger.warn(`Connection failed for ${this.hostname}: ${error.code}`);
            return false;
          }
          // 401 means session expired
          if (error.response?.status === 401) {
            logger.debug(`Session expired (401) for ${this.hostname}`);
            this.clearSession();
          }
        }
      }
      
      // No valid token or session expired, try to login
      logger.debug(`Attempting login for health check: ${this.hostname}`);
      return await this.login();
    } catch (error) {
      logger.debug(`Health check failed for ${this.hostname}:`, error);
      return false;
    }
  }

  /**
   * Get modem info
   */
  getInfo(): { hostname: string; baseUrl: string; username: string } {
    return {
      hostname: this.hostname,
      baseUrl: this.baseUrl,
      username: this.username,
    };
  }
}

export default TeltonikaClient;
