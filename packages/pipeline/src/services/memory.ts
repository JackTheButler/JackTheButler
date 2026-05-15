/**
 * MemoryProvider — long-term per-entity memory.
 *
 * The pipeline uses memory in two directions:
 *   - `recall`: surface relevant memories about the entity in the responder
 *     prompt (e.g. "prefers feather-free pillows," "trades AAPL options").
 *   - `save`: persist a new memory extracted from the conversation
 *     (e.g. by a memory-extraction stage after generate-response).
 *
 * @module services/memory
 */

import type { MemoryHit, NewMemory, MemoryRecallOptions } from '../types/memory.js';

export interface MemoryProvider {
  /** Recall long-term memories about an entity. */
  recall(entityId: string, options?: MemoryRecallOptions): Promise<readonly MemoryHit[]>;

  /** Persist a new memory. Returns the assigned id. */
  save(memory: NewMemory): Promise<{ readonly id: string }>;
}
