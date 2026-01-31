import * as crypto from 'crypto';
import logger from './logger';

/**
 * Encryption utility for sensitive configuration data
 * Uses AES-256-GCM for encryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * Get encryption key from environment variable
 * If not set, generates a warning and uses a default (NOT SECURE FOR PRODUCTION)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.CONFIG_ENCRYPTION_KEY;
  
  if (!key) {
    logger.warn('CONFIG_ENCRYPTION_KEY not set! Using insecure default key. SET THIS IN PRODUCTION!');
    // Default key for development only - DO NOT USE IN PRODUCTION
    return crypto.scryptSync('default-dev-key-change-in-production', 'salt', 32);
  }
  
  // Derive a proper 32-byte key from the provided key
  return crypto.scryptSync(key, 'encryption-salt', 32);
}

/**
 * Encrypt a plaintext string
 * Returns base64-encoded encrypted data in format: iv:authTag:encrypted
 */
export function encrypt(plaintext: string): string {
  try {
    if (!plaintext) {
      return '';
    }
    
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encrypted (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error: any) {
    logger.error('Encryption error:', error);
    throw new Error(`Failed to encrypt data: ${error.message}`);
  }
}

/**
 * Decrypt an encrypted string
 * Expects format: iv:authTag:encrypted (all base64)
 */
export function decrypt(encryptedData: string): string {
  try {
    if (!encryptedData) {
      return '';
    }
    
    // Parse the encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [ivBase64, authTagBase64, encrypted] = parts;
    
    const key = getEncryptionKey();
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error: any) {
    logger.error('Decryption error:', error);
    throw new Error(`Failed to decrypt data: ${error.message}`);
  }
}

/**
 * Check if a string appears to be encrypted
 * (Simple check: has the format iv:authTag:encrypted)
 */
export function isEncrypted(data: string): boolean {
  if (!data) {
    return false;
  }
  
  const parts = data.split(':');
  if (parts.length !== 3) {
    return false;
  }
  
  // Check if all parts are valid base64
  try {
    parts.forEach(part => Buffer.from(part, 'base64'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt an object's sensitive fields
 * Modifies the object in place and returns it
 */
export function encryptObject<T extends Record<string, any>>(
  obj: T,
  sensitiveFields: string[]
): T {
  const result: any = { ...obj };
  
  for (const field of sensitiveFields) {
    if (result[field] && typeof result[field] === 'string' && !isEncrypted(result[field])) {
      result[field] = encrypt(result[field]);
    }
  }
  
  return result as T;
}

/**
 * Decrypt an object's sensitive fields
 * Modifies the object in place and returns it
 */
export function decryptObject<T extends Record<string, any>>(
  obj: T,
  sensitiveFields: string[]
): T {
  const result: any = { ...obj };
  
  for (const field of sensitiveFields) {
    if (result[field] && typeof result[field] === 'string' && isEncrypted(result[field])) {
      try {
        result[field] = decrypt(result[field]);
      } catch (error: any) {
        logger.error(`Failed to decrypt field '${field}':`, error);
        // Leave as is if decryption fails
      }
    }
  }
  
  return result as T;
}

/**
 * Generate a secure random encryption key (for initial setup)
 * Returns a base64-encoded string suitable for CONFIG_ENCRYPTION_KEY
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Hash a password (for storing in database)
 * Uses scrypt which is resistant to GPU attacks
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, storedHash] = hash.split(':');
    
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(storedHash === derivedKey.toString('hex'));
    });
  });
}

export default {
  encrypt,
  decrypt,
  isEncrypted,
  encryptObject,
  decryptObject,
  generateEncryptionKey,
  hashPassword,
  verifyPassword,
};
