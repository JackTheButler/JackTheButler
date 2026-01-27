/**
 * ID Generator
 *
 * Generates prefixed unique IDs for different entity types.
 * Format: {prefix}_{timestamp_base36}_{random}
 */

import { randomBytes } from 'node:crypto';

/**
 * ID prefixes for different entity types
 */
export const ID_PREFIXES = {
  guest: 'gst',
  reservation: 'res',
  conversation: 'conv',
  message: 'msg',
  task: 'tsk',
  staff: 'stf',
  session: 'ses',
  knowledge: 'kb',
} as const;

export type IdPrefix = keyof typeof ID_PREFIXES;

/**
 * Generate a unique ID with a prefix
 *
 * @param prefix - Entity type prefix
 * @returns Unique ID string
 *
 * @example
 * generateId('conversation') // 'conv_lxyz123_a1b2c3'
 * generateId('message')      // 'msg_lxyz124_d4e5f6'
 */
export function generateId(prefix: IdPrefix): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `${ID_PREFIXES[prefix]}_${timestamp}_${random}`;
}
