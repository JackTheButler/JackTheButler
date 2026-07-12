/**
 * Global Test Setup
 *
 * Runs before each test file (vitest setupFiles). Points the database at a
 * fresh temporary SQLite file so tests never touch the developer's data/jack.db.
 *
 * src/db/index.ts's `db`/`sqlite` exports are lazy — they auto-initialize
 * (connect + sqlite-vec + migrate) on first property access, using whatever
 * env is active at that moment. Default role seeding is separate domain
 * logic (src/core/permissions/seed.ts) and isn't triggered automatically,
 * so we call it here explicitly once the temp DB path is set.
 *
 * Must not *statically* import any src/ module above the env var
 * assignments below: several modules (e.g. src/utils/logger.ts) still call
 * `loadConfig()` eagerly at module-eval time, and static imports are
 * evaluated before this file's own top-level statements run. The dynamic
 * `import()` after the env vars are set avoids that ordering hazard.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'jack-test-')), 'test.db');

const { seedDefaultRoles } = await import('@/core/permissions/seed.js');
seedDefaultRoles();
