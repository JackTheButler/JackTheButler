import { eq } from 'drizzle-orm';
import type { BusinessProfile } from '@janetheoperator/shared';
import { db } from '@/db/client.js';
import { businessProfile } from '@/db/schema/index.js';

/**
 * Single-row business profile. Drives:
 *   - dashboard's default reading language (Phase 1 — this stage).
 *   - the AI pipeline's `systemLanguage` (Phase 2 — translate stages).
 *
 * Lazy-seeded on first read so consumers (UI fetch, pipeline init) always
 * resolve to a usable shape even before the operator visits Settings.
 */

const ROW_ID = 'default';

// First-read shape. Only `defaultLanguage` carries a real seed — the
// pipeline needs SOMETHING to read on day zero. `name` starts empty so
// the operator fills it in; `supportEmail` starts null because not every
// deployment has one.
const DEFAULTS: BusinessProfile = {
  name: '',
  supportEmail: null,
  defaultLanguage: 'en',
};

function toDTO(row: typeof businessProfile.$inferSelect): BusinessProfile {
  return {
    name: row.name,
    supportEmail: row.supportEmail,
    defaultLanguage: row.defaultLanguage,
  };
}

export function getBusiness(): BusinessProfile {
  const existing = db
    .select()
    .from(businessProfile)
    .where(eq(businessProfile.id, ROW_ID))
    .get();
  if (existing) return toDTO(existing);

  db.insert(businessProfile)
    .values({ id: ROW_ID, ...DEFAULTS, updatedAt: new Date() })
    .run();
  return { ...DEFAULTS };
}

export function saveBusiness(input: BusinessProfile): BusinessProfile {
  db.insert(businessProfile)
    .values({ id: ROW_ID, ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: businessProfile.id,
      set: { ...input, updatedAt: new Date() },
    })
    .run();
  return getBusiness();
}
