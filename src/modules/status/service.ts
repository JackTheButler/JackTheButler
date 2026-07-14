import type { ProviderStatus, SystemStatus } from '@janetheoperator/shared';
import {
  getActiveEmbeddingInstance,
  getActiveGenerationInstance,
  listApps,
} from '@/modules/apps/service.js';

/**
 * Role-agnostic operational status for the dashboard (readable by all staff).
 * Surfaces *summary* facts derived from the apps registry — connected, the
 * provider's display name, and a coarse health — without exposing the
 * admin-only config/secrets/error details.
 */

function providerStatus(category: string, connected: boolean): ProviderStatus {
  // The configured app for this category (active or errored — not the
  // unconfigured/disabled ones).
  const app = listApps().find(
    (a) => a.category === category && (a.status === 'active' || a.status === 'error'),
  );
  const health = app?.status === 'error' ? 'error' : connected ? 'ok' : 'unknown';
  return { connected, name: app?.name ?? null, health };
}

export function getSystemStatus(): SystemStatus {
  return {
    providers: {
      embedding: providerStatus('embedding', getActiveEmbeddingInstance() !== null),
      // Generation apps use the `ai` category in their manifest.
      generation: providerStatus('ai', getActiveGenerationInstance() !== null),
    },
  };
}
