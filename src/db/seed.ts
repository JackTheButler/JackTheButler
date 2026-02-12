/**
 * Database Seed Script
 *
 * Creates essential settings and default roles for the application.
 * The admin user is created by the migration.
 * Sample/demo data is loaded separately via the UI (POST /api/v1/seed/demo).
 *
 * Run with: pnpm db:seed
 */

import { eq } from 'drizzle-orm';
import { db, settings, roles } from './index.js';
import { DEFAULT_ROLES } from '@/core/permissions/defaults.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('seed');

/**
 * Seed default roles into the database
 */
async function seedRoles(): Promise<number> {
  let seededCount = 0;

  for (const role of DEFAULT_ROLES) {
    // Check if role already exists
    const existing = await db.select().from(roles).where(eq(roles.id, role.id)).limit(1);

    if (existing.length === 0) {
      const now = new Date().toISOString();
      await db.insert(roles).values({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: JSON.stringify(role.permissions),
        isSystem: role.isSystem,
        createdAt: now,
        updatedAt: now,
      });
      seededCount++;
      log.info({ roleId: role.id, roleName: role.name }, 'Created default role');
    }
  }

  return seededCount;
}

async function seed() {
  log.info('Starting database seed...');

  // 1. Seed default roles (always run, idempotent)
  const rolesSeeded = await seedRoles();
  log.info({ count: rolesSeeded }, 'Seeded roles');

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

// Export for programmatic use
export { seedRoles };

seed().catch((error) => {
  log.error({ error }, 'Seed failed');
  process.exit(1);
});
