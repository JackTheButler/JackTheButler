/**
 * Twilio Security
 *
 * Validates Twilio webhook signatures to ensure requests are authentic.
 */

import twilio from 'twilio';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('sms:security');

/**
 * Verify Twilio webhook signature
 *
 * @param signature - The X-Twilio-Signature header value
 * @param url - The full webhook URL
 * @param params - The request body parameters
 * @returns true if signature is valid
 */
export function verifyTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const config = loadConfig();

  if (!config.sms.authToken) {
    log.warn('Cannot verify signature: auth token not configured');
    // In development, allow requests without verification
    if (config.env === 'development') {
      return true;
    }
    return false;
  }

  const isValid = twilio.validateRequest(
    config.sms.authToken,
    signature,
    url,
    params
  );

  if (!isValid) {
    log.warn({ signature, url }, 'Invalid Twilio signature');
  }

  return isValid;
}
