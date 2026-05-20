/**
 * Server-side app contract. Implemented by `packages/*` integration packages,
 * consumed by the API via the registry. Types only — erased at compile, so
 * importing this never ships code to the browser. Concrete implementations
 * (crypto, IO) live in the app packages, never in shared.
 */
import type { AppManifest } from './manifest.js';

export type AppConfig = Record<string, unknown>;

export interface ValidationResult {
  ok: boolean;
  /** Field-keyed messages when ok === false. */
  errors?: Record<string, string>;
}

/** Minimal contract every app instance exposes. Category-specific contracts
 *  (channel send / AI generate) are defined in their own stages. */
export interface AppContract {
  check(): Promise<{ ok: boolean; detail?: string }>;
}

export interface AppModule<C extends AppConfig = AppConfig> {
  manifest: AppManifest;
  validate(config: AppConfig): ValidationResult;
  createInstance(config: C): AppContract;
}

/**
 * Channel contract (category `channel`). Inbound is handled by the gateway
 * calling the conversation ingest; the channel instance is responsible for
 * **outbound** delivery. `send` is defined now; webchat's real-time
 * implementation lands in slice 4 (WebSocket).
 */
export interface ChannelContract extends AppContract {
  send(externalId: string, content: string): Promise<void>;
}

/**
 * Generation contract (category `ai`, capability `generation`). Implemented
 * by AI app packages (ai-anthropic, …) and consumed by the AI pipeline
 * adapter. Provider-neutral on purpose — the message-shape mirrors the
 * lowest common denominator (system / user / assistant), so any
 * Anthropic/OpenAI/Bedrock impl maps trivially.
 */
export interface GenerationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Hint to the provider about which model tier to use:
 *  - `'reasoning'` — main model (Anthropic: `completionModel`, e.g. Opus/Sonnet).
 *    Suitable for response generation.
 *  - `'utility'` — cheaper/faster model (Anthropic: `utilityModel`, e.g. Haiku).
 *    Suitable for language detection, translation, classification.
 *
 *  Defaults to `'reasoning'`. Providers may map both to the same model if
 *  they don't need the distinction. */
export type ModelTier = 'reasoning' | 'utility';

export interface GenerationRequest {
  messages: readonly GenerationMessage[];
  /** Output length cap. Caller picks; provider may clamp. */
  maxTokens?: number;
  /** 0..1+ — lower is more deterministic. Provider-default if omitted. */
  temperature?: number;
  /** Which model tier the caller prefers; defaults to `'reasoning'`. */
  modelTier?: ModelTier;
}

export interface GenerationResult {
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface GenerationContract extends AppContract {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}
