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
