/**
 * Database Seed Script
 *
 * Creates essential settings and default roles for the application.
 * The admin user is created by the migration.
 * Sample/demo data is loaded separately via the UI (POST /api/v1/seed/demo).
 *
 * This is a standalone CLI script (like the other files in scripts/), so it
 * lives outside src/ — it isn't part of the kernel/adapter layering that
 * governs src/db/**, src/core/**, etc., and isn't covered by `pnpm lint`,
 * `pnpm lint:deps`, or `pnpm typecheck` (which only scan/compile src/).
 *
 * Run with: pnpm db:seed
 */

import { db, settings } from '../src/db/index.js';
import { seedDefaultRoles } from '../src/core/permissions/seed.js';
import { createLogger } from '../src/utils/logger.js';

const log = createLogger('seed');

async function seed() {
  log.info('Starting database seed...');

  // 1. Seed default roles (always run, idempotent)
  seedDefaultRoles();

  // 2. Check if settings already seeded
  const existing = await db.select().from(settings).limit(1);
  if (existing.length > 0) {
    log.info('Settings already seeded, skipping');
    log.info('Database seed complete!');
    return;
  }

  // 3. Seed essential settings
  const settingsData = [
    { key: 'hotel.name', value: 'Demo Hotel' },
    { key: 'hotel.timezone', value: 'UTC' },
    { key: 'ai.provider', value: 'anthropic' },
    { key: 'ai.model', value: 'claude-sonnet-4-20250514' },
  ];

  for (const setting of settingsData) {
    await db.insert(settings).values(setting);
  }
  log.info({ count: settingsData.length }, 'Seeded settings');

  log.info('Database seed complete!');
}

seed().catch((error) => {
  log.error({ error }, 'Seed failed');
  process.exit(1);
});
