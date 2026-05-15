/**
 * IntentProvider — the domain's intent catalog.
 *
 * @module services/intent
 */

import type { Intent } from '../types/intent.js';

export interface IntentProvider {
  /** All intents available for classification, in a stable order. */
  list(): readonly Intent[];

  /**
   * Look up an intent by canonical name.
   * Returns `null` when the name isn't in the catalog
   * (e.g. a malformed classifier output).
   */
  get(name: string): Intent | null;
}
