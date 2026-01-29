/**
 * Twilio Security (Legacy)
 *
 * @deprecated Use extension registry to get auth token for signature verification.
 */

import { createLogger } from '@/utils/logger.js';

const log = createLogger('sms:security');

/**
 * Verify Twilio webhook signature
 *
 * @deprecated Always returns false. Use extension-based verification instead.
 */
export function verifyTwilioSignature(
  _signature: string,
  _url: string,
  _params: Record<string, string>
): boolean {
  log.warn('Legacy verifyTwilioSignature called. Use extension-based verification.');
  return false;
}
