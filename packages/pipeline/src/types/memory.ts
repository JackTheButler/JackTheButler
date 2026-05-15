/**
 * Memory data shapes — recalled memory projections and write payload.
 *
 * @module types/memory
 */

export interface MemoryHit {
  /** Category / type of the memory (e.g. `'preference'`, `'fact'`). */
  readonly key: string;

  /** The memory content itself. */
  readonly value: string;

  /** Similarity to the query embedding if ranked, otherwise undefined. */
  readonly similarity?: number;
}

export interface NewMemory {
  /** The entity this memory belongs to. */
  readonly entityId: string;

  /** Category / type of the memory. */
  readonly key: string;

  /** The memory content. */
  readonly value: string;

  /** Optional precomputed embedding of the memory content for future recall. */
  readonly embedding?: readonly number[];

  /** Free-form extras (source, confidence, etc.). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MemoryRecallOptions {
  /**
   * Embedding to rank memories by relevance. When omitted, implementations
   * may return recent memories or none, at their discretion.
   */
  readonly embedding?: readonly number[];

  /** Maximum number of memories to return. */
  readonly limit?: number;
}
