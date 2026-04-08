/**
 * Message Pipeline Context
 *
 * The central state object for the message processing pipeline.
 * Created at the start of MessageProcessor.process() and passed through
 * every stage. Stages read what they need from ctx and write their outputs back.
 *
 * @module core/pipeline/context
 */

import type { Conversation, GuestMemory } from '@/db/schema.js';
import type { InboundMessage, OutboundMessage } from '@/types/message.js';
import type { GuestContext } from '@/core/conversation/guest-context.js';
import type { Response as AIResponse } from '@/core/ai/types.js';
import type { KnowledgeSearchResult } from '@/core/ai/knowledge/index.js';
import type { ClassificationResult } from '@/core/ai/intent/index.js';
import type { VerificationState } from '@/services/verification.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('core:pipeline');

export type { AIResponse };

/**
 * Pipeline context — all state for a single message being processed.
 * Flows through every stage; each stage reads its inputs and writes its outputs.
 */
export interface MessageContext {
  // ── Input ─────────────────────────────────────────────────
  inbound: InboundMessage;
  startTime: number;

  // ── Guest ─────────────────────────────────────────────────
  guestContext?: GuestContext;

  // ── Conversation ──────────────────────────────────────────
  conversation?: Conversation;
  propertyLanguage?: string;

  // ── Language ──────────────────────────────────────────────
  detectedLanguage?: string;
  translatedContent?: string;     // inbound translated to property language

  // ── Persistence ───────────────────────────────────────────
  savedInboundId?: string;
  savedOutboundId?: string;

  // ── Embedding + Knowledge + Memory ────────────────────────
  queryEmbedding?: number[];
  knowledgeResults?: KnowledgeSearchResult[];
  memories?: GuestMemory[];

  // ── Conversation history ──────────────────────────────────
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;

  // ── Classification ─────────────────────────────────────────
  classification?: ClassificationResult;

  // ── Verification ───────────────────────────────────────────
  verification?: VerificationState;

  // ── AI response ───────────────────────────────────────────
  aiResponse?: AIResponse;
  translatedResponse?: string;    // aiResponse translated to guest language

  // ── Post-processing flags ─────────────────────────────────
  escalated?: boolean;
  taskCreated?: boolean;

  // ── Pipeline control ──────────────────────────────────────
  done?: boolean;                 // set true to stop the pipeline early
  approvalId?: string;            // set by checkAutonomy when approval required
  approvalReason?: string;        // set by checkAutonomy when approval required

  // ── Final output ──────────────────────────────────────────
  outbound?: OutboundMessage;     // set by saveOutboundMessage or checkAutonomy

  // ── Outcome (read by finally block in MessageProcessor) ───
  outcome?: 'success' | 'failed';
  outcomeDetails?: Record<string, unknown>;
}

/**
 * Safely merge metadata into ctx.aiResponse without overwriting existing keys.
 * Both routeTask and checkEscalation write to aiResponse.metadata — always use
 * this helper to avoid one stage silently wiping the other's metadata.
 */
export function mergeResponseMetadata(ctx: MessageContext, patch: Record<string, unknown>): void {
  if (!ctx.aiResponse) return;
  ctx.aiResponse.metadata = { ...ctx.aiResponse.metadata, ...patch };
}

/**
 * Create a fresh pipeline context for an inbound message.
 */
export function createContext(inbound: InboundMessage): MessageContext {
  return { inbound, startTime: Date.now() };
}

/**
 * Run a sequence of pipeline stages against a context.
 * Stops early if any stage sets ctx.done = true.
 * Errors are not caught here — they propagate to MessageProcessor.process().
 */
export async function runPipeline(
  ctx: MessageContext,
  stages: Array<(ctx: MessageContext) => Promise<void>>
): Promise<void> {
  for (const stage of stages) {
    if (ctx.done) break;
    const t = Date.now();
    await stage(ctx);
    log.debug({ stage: stage.name, durationMs: Date.now() - t }, 'stage complete');
  }
}
