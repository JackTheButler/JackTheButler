/**
 * Pipeline — Env, Services, Stage, and createPipeline factory.
 *
 * A pipeline is configured once with its `intents`, `prompts`, `services`,
 * and ordered list of stages. It then processes inbound messages by
 * running each stage against a fresh `MessageContext`. Stages read/write
 * the context and may short-circuit by setting `ctx.done = true`.
 *
 * Stages receive their dependencies (`intents`, `prompts`, `services`) as
 * the second argument — bundled as `Env`. This keeps `MessageContext` a
 * pure description of per-message working state; the environment is
 * injected once at pipeline creation and reused for every message.
 *
 * @module core/pipeline
 */

import type { MessageContext } from './context.js';
import { defaultStages } from '../stages/index.js';
import type { InboundMessage, OutboundMessage } from '../types/messages.js';
import type { EntityProvider } from '../services/entity.js';
import type { IntentProvider } from '../services/intent.js';
import type { PromptProvider } from '../services/prompt.js';
import type { AIProvider } from '../services/ai.js';
import type { ConversationProvider } from '../services/conversation.js';
import type { Logger } from '../services/logger.js';
import type { KnowledgeProvider } from '../services/knowledge.js';
import type { MemoryProvider } from '../services/memory.js';

// ─── Services bundle ────────────────────────────────────────────

/**
 * The IO-bound adapters the pipeline talks to. Implementations live in
 * `src/services/` and are wired into the pipeline at boot.
 *
 * **Naming convention:** type names end in `Provider` to mark them as
 * service contracts. Field names are the short noun you reach for at the
 * call site (`services.memory.recall(...)`), without the suffix.
 *
 * Four services are **required**; the other two are **optional** —
 * feature-gated stages that use them are no-ops if the service is missing,
 * so consumers can skip features they don't need.
 */
export interface Services {
  // Required
  /** Resolves the domain entity (user) from the inbound's channel identity. */
  entities: EntityProvider;

  /** LLM completion + embedding. Used by classify, embed, generate, translation. */
  ai: AIProvider;

  /** Conversation persistence — find/create, append, fetch history. */
  conversation: ConversationProvider;

  /** Structured logging used by every stage. */
  logger: Logger;

  // Optional (feature-gated)
  /** Vector search over a knowledge corpus. Needed if `load-knowledge` runs. */
  knowledge?: KnowledgeProvider;

  /** Long-term per-entity memory. Needed if `load-memories` runs. */
  memory?: MemoryProvider;
}

// ─── Env ────────────────────────────────────────────────────────

/**
 * The environment a stage executes in: vertical-specific config (intents,
 * prompts) plus infrastructure services. Captured at pipeline creation
 * and passed unchanged to every stage.
 *
 * Generic over `TCtx` so that `prompts.responder(ctx, env)` typechecks
 * against a domain-extended context.
 */
export interface Env<TCtx extends MessageContext = MessageContext> {
  /** The intents the classifier may choose from. */
  readonly intents: IntentProvider;

  /** The persona / classifier prompts for this domain. */
  readonly prompts: PromptProvider<TCtx>;

  /** IO-bound adapters (entities, AI, conversation persistence, logging, etc.). */
  readonly services: Services;

  /**
   * The language the system operates in (BCP-47 code, e.g. `'en'`, `'fr'`).
   * Knowledge base, prompts, and the LLM all "speak" this language. The
   * translate stages convert inbound to and outbound from this language
   * when the user writes in something different.
   *
   * Defaults to `'en'` when not provided to `createPipeline`.
   */
  readonly systemLanguage: string;
}

// ─── Stage ──────────────────────────────────────────────────────

/**
 * A single processing step. Reads from / writes to `ctx`; may set
 * `ctx.done = true` to short-circuit the rest of the pipeline.
 *
 * Generic over the context type so consumers can declare their own
 * `TCtx extends MessageContext` to carry domain-specific working state
 * (e.g. `verification`, `approvalId`). All such added fields must be
 * **optional** — `createPipeline` starts with a bare `{ inbound }`.
 *
 * Reference stages are typed `Stage<MessageContext>` and are assignable to
 * `Stage<TCtx>` for any `TCtx extends MessageContext` (parameter
 * contravariance), so `[...defaultStages, myCustomStage]` composes cleanly.
 */
export type Stage<TCtx extends MessageContext = MessageContext> =
  (ctx: TCtx, env: Env<TCtx>) => Promise<void>;

/**
 * Configuration handed to `createPipeline` once at app startup.
 *
 * `intents`, `prompts`, `services` are required. `systemLanguage` is
 * optional (defaults to `'en'`). `stages` is optional (defaults to
 * `defaultStages` from the `stages` module).
 *
 * Generic over `TCtx` for the same reasons as `Stage`.
 */
export interface PipelineConfig<TCtx extends MessageContext = MessageContext>
  extends Omit<Env<TCtx>, 'systemLanguage'> {
  readonly systemLanguage?: string;
  readonly stages?: readonly Stage<TCtx>[];
}

/**
 * The pipeline returned by `createPipeline`. Call `process` per inbound.
 *
 * ### Return value
 *
 * On success, `process()` returns the final `ctx` with `outbound`
 * narrowed to required. Callers can read the outbound (`ctx.outbound`),
 * the persisted ids (`ctx.savedInboundId`), the classification, the
 * timing (`ctx.startTime`), and any other state the stages produced —
 * everything is on one object.
 *
 * ### Error semantics
 *
 * `process()` throws a {@link PipelineError} when:
 * - Any stage throws an unhandled error (stages run sequentially; the
 *   rest are skipped). Reference stages catch their own LLM/IO errors
 *   and log them, but a custom stage may not.
 * - The pipeline completes without any stage setting `ctx.outbound`.
 *
 * The thrown `PipelineError` carries both the original cause and the
 * `ctx` at the point of failure, so consumers can emit failure events
 * with the same payload richness as success events.
 *
 * Generic over `TCtx` so consumers with extended contexts (e.g.
 * `ButlerContext`) read their custom fields off the returned ctx with
 * full type safety.
 */
export interface Pipeline<TCtx extends MessageContext = MessageContext> {
  /**
   * Process one inbound message through the configured stages.
   * @throws {@link PipelineError} when a stage throws or the pipeline
   *   produces no outbound.
   */
  process(inbound: InboundMessage): Promise<TCtx & { outbound: OutboundMessage }>;
}

/**
 * Thrown by `pipeline.process()` when a stage fails or the run finishes
 * without an outbound. Carries both the underlying `cause` and the
 * pipeline `ctx` at the moment of failure — consumers can emit failure
 * events with the same `ctx` access they'd have on the success path
 * (`err.ctx.savedInboundId`, `err.ctx.conversation`, etc.).
 *
 * Generic over `TCtx` so consumer wrappers can narrow the ctx type via
 * `if (err instanceof PipelineError)` followed by a cast.
 */
export class PipelineError<TCtx extends MessageContext = MessageContext> extends Error {
  /** The underlying error that caused the pipeline run to fail. */
  readonly cause: unknown;
  /** The pipeline ctx at the moment of failure. May be partial. */
  readonly ctx: TCtx;

  constructor(cause: unknown, ctx: TCtx) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'PipelineError';
    this.cause = cause;
    this.ctx = ctx;
  }
}

// ─── Factory ────────────────────────────────────────────────────

/**
 * Create a configured pipeline. Called once at app boot.
 *
 * Errors from `pipeline.process()` propagate to the caller — see
 * `Pipeline` for full error semantics.
 *
 * @example
 * // Use the default stage list:
 * const pipeline = createPipeline({
 *   intents: hospitalityIntents,
 *   prompts: hospitalityPrompts,
 *   services: realServices,
 * });
 *
 * @example
 * // Override the stage list:
 * import { defaultStages, myCustomStage } from '@jackthebutler/pipeline';
 * const pipeline = createPipeline({
 *   // ...
 *   stages: [...defaultStages, myCustomStage],
 * });
 *
 * @example
 * // Caller is responsible for error handling:
 * try {
 *   const response = await pipeline.process(inbound);
 *   await sendToUser(response);
 * } catch (err) {
 *   logger.error({ err }, 'Pipeline failed');
 *   // decide: retry, fallback reply, alert oncall, etc.
 * }
 */
export function createPipeline<TCtx extends MessageContext = MessageContext>(
  config: PipelineConfig<TCtx>,
): Pipeline<TCtx> {
  const env: Env<TCtx> = {
    intents: config.intents,
    prompts: config.prompts,
    services: config.services,
    systemLanguage: config.systemLanguage ?? 'en',
  };
  const stages: readonly Stage<TCtx>[] =
    config.stages ?? (defaultStages as readonly Stage<TCtx>[]);

  return {
    async process(inbound: InboundMessage): Promise<TCtx & { outbound: OutboundMessage }> {
      // The initial context sets `inbound` and `startTime`. Any `TCtx`
      // extension fields must be optional, so this cast is sound at
      // runtime.
      const ctx = { inbound, startTime: Date.now() } as TCtx;

      try {
        for (const stage of stages) {
          if (ctx.done) break;
          await stage(ctx, env);
        }

        if (!ctx.outbound) {
          throw new Error('Pipeline finished without producing an outbound message');
        }
        return ctx as TCtx & { outbound: OutboundMessage };
      } catch (err) {
        // Don't double-wrap if a stage already threw a PipelineError.
        if (err instanceof PipelineError) throw err;
        throw new PipelineError(err, ctx);
      }
    },
  };
}
