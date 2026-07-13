/**
 * Default Role Seeding
 *
 * Ensures the built-in system roles (DEFAULT_ROLES) exist in the database.
 * This is domain logic (permissions), not database plumbing, so it lives
 * here rather than in src/db/index.ts — the db layer stays free of any
 * knowledge of roles/permissions.
 *
 * Called explicitly by the composition root (src/index.ts) right after
 * initDb(), and by tests/setup.ts for the test database.
 */

import { eq } from 'drizzle-orm';
import { db, roles } from '@/db/index.js';
import { createLogger } from '@/utils/logger.js';
import { now } from '@/utils/time.js';
import { DEFAULT_ROLES } from './defaults.js';

const log = createLogger('permissions');

/**
 * Seed default roles if they don't already exist. Idempotent — safe to
 * call on every startup / test run.
 */
export function seedDefaultRoles(): void {
  try {
    for (const role of DEFAULT_ROLES) {
      // Check if role already exists
      const existing = db.select().from(roles).where(eq(roles.id, role.id)).get();

      if (!existing) {
        db.insert(roles)
          .values({
            id: role.id,
            name: role.name,
            description: role.description,
            permissions: JSON.stringify(role.permissions),
            isSystem: role.isSystem,
            createdAt: now(),
            updatedAt: now(),
          })
          .run();
        log.info({ roleId: role.id, roleName: role.name }, 'Created default role');
      }
    }
    log.info('Default roles verified');
  } catch (error) {
    log.error({ error }, 'Failed to seed default roles');
    throw error;
  }
}
