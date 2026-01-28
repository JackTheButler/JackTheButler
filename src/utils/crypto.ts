/**
 * Cryptographic Utilities
 *
 * Simple encryption/decryption for storing sensitive data like API keys.
 * Uses AES-256-GCM for authenticated encryption.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { loadConfig } from '@/config/index.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

/**
 * Derive an encryption key from the JWT secret
 */
function deriveKey(salt: Buffer): Buffer {
  const config = loadConfig();
  return scryptSync(config.jwt.secret, salt, KEY_LENGTH);
}

/**
 * Encrypt a string value
 *
 * @param plaintext - The value to encrypt
 * @returns Base64-encoded encrypted value (format: salt:iv:authTag:ciphertext)
 */
export function encrypt(plaintext: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Combine all parts: salt + iv + authTag + ciphertext
  const combined = Buffer.concat([
    salt,
    iv,
    authTag,
    Buffer.from(ciphertext, 'base64'),
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt an encrypted value
 *
 * @param encrypted - Base64-encoded encrypted value
 * @returns Decrypted plaintext
 * @throws Error if decryption fails
 */
export function decrypt(encrypted: string): string {
  const combined = Buffer.from(encrypted, 'base64');

  // Extract parts
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = deriveKey(salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext.toString('base64'), 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Encrypt an object (JSON)
 */
export function encryptObject(obj: Record<string, unknown>): string {
  return encrypt(JSON.stringify(obj));
}

/**
 * Decrypt an object (JSON)
 */
export function decryptObject<T = Record<string, unknown>>(encrypted: string): T {
  return JSON.parse(decrypt(encrypted)) as T;
}

/**
 * Mask a sensitive value for display (show first 4 and last 4 chars)
 */
export function maskValue(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars * 2) {
    return '*'.repeat(value.length);
  }
  const start = value.substring(0, visibleChars);
  const end = value.substring(value.length - visibleChars);
  const middle = '*'.repeat(Math.min(value.length - visibleChars * 2, 20));
  return `${start}${middle}${end}`;
}

/**
 * Mask sensitive fields in a config object
 */
export function maskConfig(
  config: Record<string, string | boolean | number>,
  sensitiveFields: string[] = ['apiKey', 'authToken', 'password', 'secret', 'accessToken']
): Record<string, string | boolean | number> {
  const masked: Record<string, string | boolean | number> = {};

  for (const [key, value] of Object.entries(config)) {
    const isSensitive = sensitiveFields.some(
      (field) => key.toLowerCase().includes(field.toLowerCase())
    );

    if (isSensitive && typeof value === 'string') {
      masked[key] = maskValue(value);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}
