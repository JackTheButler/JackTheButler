/**
 * KnowledgeProvider — vector search over a domain knowledge base.
 *
 * Read-only contract: the pipeline only retrieves. Indexing, ingestion,
 * and chunking are the consumer's responsibility (typically done outside
 * the message-processing pipeline).
 *
 * @module services/knowledge
 */

import type { KnowledgeHit, KnowledgeSearchOptions } from '../types/knowledge.js';

export interface KnowledgeProvider {
  /**
   * Search the knowledge base using a precomputed embedding.
   * Embeddings are computed once by the `compute-embedding` stage and
   * passed to both knowledge and memory retrieval, avoiding duplicate
   * embedding calls.
   */
  search(
    embedding: readonly number[],
    options?: KnowledgeSearchOptions,
  ): Promise<readonly KnowledgeHit[]>;
}
