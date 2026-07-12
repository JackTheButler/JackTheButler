/**
 * Intent Catalog Tests
 *
 * Hospitality intent catalog (`src/core/pipeline/intents.ts`): the
 * `IntentDefinitions` record plus the `intentProvider` adapter that
 * projects definitions into the pipeline package's `Intent` shape.
 *
 * LLM-driven classification itself (JSON parsing, confidence clamping,
 * malformed responses, provider errors) is generic pipeline behavior,
 * already covered by packages/pipeline/tests/stages.test.ts's
 * "classifyIntent — JSON parsing" suite — not duplicated here.
 */

import { describe, it, expect } from 'vitest';
import { IntentDefinitions, getIntentDefinition, intentProvider } from '@/core/pipeline/intents.js';

describe('Intent Catalog', () => {
  it('should have required intents defined', () => {
    const intentNames = Object.keys(IntentDefinitions);

    expect(intentNames).toContain('request.housekeeping.towels');
    expect(intentNames).toContain('inquiry.checkout');
    expect(intentNames).toContain('greeting');
    expect(intentNames).toContain('unknown');
  });

  it('should return intent definition', () => {
    const definition = getIntentDefinition('inquiry.checkout');

    expect(definition).toBeDefined();
    expect(definition?.department).toBeNull();
    expect(definition?.requiresAction).toBe(false);
  });

  it('should return undefined for unknown intent name', () => {
    const definition = getIntentDefinition('nonexistent.intent');
    expect(definition).toBeUndefined();
  });

  it('should have examples for each intent except unknown', () => {
    for (const [name, def] of Object.entries(IntentDefinitions)) {
      if (name !== 'unknown') {
        expect(def.examples.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('intentProvider', () => {
  it('lists every catalog intent, projecting routing metadata', () => {
    const intents = intentProvider.list();

    expect(intents.length).toBe(Object.keys(IntentDefinitions).length);

    const towels = intents.find((i) => i.name === 'request.housekeeping.towels');
    expect(towels).toBeDefined();
    expect(towels?.metadata?.department).toBe('housekeeping');
    expect(towels?.metadata?.requiresAction).toBe(true);
  });

  it('gets a single intent by name', () => {
    const intent = intentProvider.get('greeting');
    expect(intent?.name).toBe('greeting');
    expect(intent?.metadata?.department).toBeNull();
  });

  it('returns null for an unknown intent name', () => {
    expect(intentProvider.get('nonexistent.intent')).toBeNull();
  });
});
