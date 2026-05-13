/**
 * Channel Extensions
 *
 * WebChat is a built-in channel that stays in src/.
 * All other channel providers are workspace packages discovered via node_modules/@jackthebutler/.
 *
 * @module extensions/channels
 */

// WebChat (built-in, stays in src/)
export {
  manifest as webchatManifest,
  webchatConnectionManager,
} from './webchat/index.js';
