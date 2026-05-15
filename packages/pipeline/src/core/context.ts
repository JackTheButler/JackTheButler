/**
 * Message Pipeline Context
 *
 * The state object that flows through every stage of a single pipeline run.
 * Fields are ordered top-to-bottom to mirror the order they're populated as
 * the pipeline executes — reading this file is a tour of the processing flow.
 *
 * Only working state lives here. Deps (`domain`, `services`) are injected
 * via the second argument to each stage, not on the context.
 *
 * @module context
 */

import type { InboundMessage, OutboundMessage } from '../types/messages.js';
import type { Conversation, Message } from '../types/conversation.js';
import type { Entity } from '../types/entity.js';
import type { KnowledgeHit } from '../types/knowledge.js';
import type { MemoryHit } from '../types/memory.js';
import type { ClassificationResult } from '../types/classification.js';
import type { AIResponse } from '../types/response.js';

export interface MessageContext {
  // Input
  /** The message being processed. */
  readonly inbound: InboundMessage;

  /**
   * Pipeline-run start, in ms since epoch (`Date.now()`). Set by
   * `pipeline.process()` when the context is created, used by
   * consumers for duration metrics — e.g.
   * `Date.now() - ctx.startTime` at completion or in error handlers,
   * or in emitted events.
   */
  readonly startTime: number;

  // Resolution
  /** The conversation/thread this message belongs to. */
  conversation?: Conversation;

  /** The resolved entity (user). `null` when the channel can't auto-identify. */
  entity?: Entity | null;

  // Language
  /** BCP-47 language code of the inbound (e.g. 'en', 'fr'). */
  inboundLanguage?: string;

  /** Inbound's content translated to the system language. */
  inboundTranslation?: string;

  // History
  /** Recent conversation turns for context-aware processing. */
  history?: readonly Message[];

  // Persistence
  /**
   * Id of the inbound message row written by `saveInboundMessage`.
   * This is the **DB-side** id used for event correlation, error
   * reports, and audit trails. The **channel-side** id (e.g. WhatsApp
   * message ID) lives on `inbound.id` and is a different value.
   */
  savedInboundId?: string;

  // Classification
  /** Intent classification of the inbound. */
  classification?: ClassificationResult;

  // Retrieval
  /** Embedding of the inbound; shared between knowledge and memory stages. */
  inboundEmbedding?: readonly number[];

  /** Top-k knowledge-base hits relevant to the inbound. */
  knowledgeHits?: readonly KnowledgeHit[];

  /** Long-term memories about the entity worth surfacing in the prompt. */
  memoryHits?: readonly MemoryHit[];

  // Response
  /** The AI-generated response (text + metadata). */
  aiResponse?: AIResponse;

  /** AI response translated to the user's language. Feeds `outbound.content`. */
  outboundTranslation?: string;

  // Output
  /** The final outbound message — returned from `pipeline.process`. */
  outbound?: OutboundMessage;

  // Control
  /** Set to `true` by any stage to short-circuit the rest of the pipeline. */
  done?: boolean;
}
