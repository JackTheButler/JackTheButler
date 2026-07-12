/**
 * Global Test Setup
 *
 * Runs before each test file (vitest setupFiles). Points the database at a
 * fresh temporary SQLite file so tests never touch the developer's data/jack.db.
 * Migrations run automatically when src/db/index.ts initializes.
 *
 * Must not import any src/ module — env vars have to be set before the
 * config/db modules are loaded by the test file.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'jack-test-')), 'test.db');
