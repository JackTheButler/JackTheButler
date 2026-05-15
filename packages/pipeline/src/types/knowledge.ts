/**
 * Knowledge data shapes — projections of a knowledge-base search result
 * and the search options.
 *
 * @module types/knowledge
 */

export interface KnowledgeHit {
  /** Stable identifier of the source document/chunk. */
  readonly id: string;

  /** Short title used in the responder prompt's RAG section. */
  readonly title: string;

  /** Body content used in the responder prompt's RAG section. */
  readonly content: string;

  /** Cosine similarity (or equivalent) to the query embedding, 0..1. */
  readonly similarity: number;
}

export interface KnowledgeSearchOptions {
  /** Maximum number of hits to return. */
  readonly limit?: number;

  /** Drop hits below this similarity threshold. */
  readonly minSimilarity?: number;
}
