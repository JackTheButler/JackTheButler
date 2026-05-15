/**
 * Stub DomainAdapter for pipeline tests.
 *
 * The pipeline now requires a DomainAdapter to construct a MessageContext,
 * but most stage tests don't actually exercise the domain — they just need
 * something that satisfies the type. This stub returns null/empty values
 * for every method, which is fine because the stages under test don't call
 * the domain (yet).
 *
 * Stages that *do* call the domain (Phases 4–6) should override the relevant
 * sub-interface in their test or use a domain-specific fixture.
 */

import type { DomainAdapter } from '@/core/domain/adapter.js';

export const stubDomain: DomainAdapter = {
  id: 'stub',
  displayName: 'Stub',
  entities: {
    resolve: async () => null,
    findById: async () => null,
  },
  intents: {
    list: () => [],
    get: () => null,
  },
  prompts: {
    classifier: () => '',
    responder: () => '',
  },
};
