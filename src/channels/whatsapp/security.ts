/**
 * WhatsApp Security (Legacy)
 *
 * @deprecated Use the verifySignature function in the webhook route instead.
 * That function takes appSecret as a parameter from extension config.
 */

import { createLogger } from '@/utils/logger.js';

const log = createLogger('whatsapp:security');

/**
 * Verify the signature of a WhatsApp webhook request
 *
 * @deprecated Always returns false. Use webhook route's verifySignature instead
 * which gets appSecret from extension config.
 */
export function verifySignature(_payload: string, _signature: string | undefined): boolean {
  log.warn('Legacy verifySignature called. Use webhook route verifySignature instead.');
  return false;
}
