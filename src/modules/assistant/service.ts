import { eq } from 'drizzle-orm';
import type { AssistantProfile } from '@janetheoperator/shared';
import { db } from '@/db/client.js';
import { assistantProfile } from '@/db/schema/index.js';

/**
 * Single-row assistant persona. The pipeline reads this on every turn to
 * build the system prompt, so reads must succeed even before an operator
 * has visited the page — first read lazy-seeds the defaults below.
 *
 * Transport-agnostic: no `Context`, no HTTP — the route layer adapts.
 */

const ROW_ID = 'default';

const DEFAULTS: AssistantProfile = {
  name: 'Jane',
  tone: 'Friendly',
  responseLength: 'standard',
  instructions:
    'Be helpful and accurate. If you are unsure, say so and offer to connect a human.',
  fallback: "I'm not certain about that. Let me get a teammate to help you.",
  topicsToAvoid: '',
};

function toDTO(row: typeof assistantProfile.$inferSelect): AssistantProfile {
  return {
    name: row.name,
    tone: row.tone as AssistantProfile['tone'],
    responseLength: row.responseLength as AssistantProfile['responseLength'],
    instructions: row.instructions,
    fallback: row.fallback,
    topicsToAvoid: row.topicsToAvoid,
  };
}

/** Read the profile, seeding defaults on first access. Always returns a row. */
export function getAssistant(): AssistantProfile {
  const existing = db
    .select()
    .from(assistantProfile)
    .where(eq(assistantProfile.id, ROW_ID))
    .get();
  if (existing) return toDTO(existing);

  db.insert(assistantProfile)
    .values({ id: ROW_ID, ...DEFAULTS, updatedAt: new Date() })
    .run();
  return { ...DEFAULTS };
}

/**
 * Patch the single row: merge the provided fields over the current profile
 * (seeding defaults first if absent) and persist. Omitted fields are left
 * unchanged, so a caller can save just the subset it edited. `undefined`
 * values are ignored so a sparse body never clobbers a stored field.
 */
export function saveAssistant(input: Partial<AssistantProfile>): AssistantProfile {
  const current = getAssistant(); // ensures the row exists (lazy-seed)
  // Drop undefined values so a sparse body never clobbers a stored field,
  // then layer the provided fields over the current profile.
  const provided = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  );
  const merged: AssistantProfile = { ...current, ...provided };

  db.insert(assistantProfile)
    .values({ id: ROW_ID, ...merged, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: assistantProfile.id,
      set: { ...merged, updatedAt: new Date() },
    })
    .run();
  return getAssistant();
}
