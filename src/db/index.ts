/**
 * Database Layer
 *
 * SQLite database connection with Drizzle ORM.
 * Configured with WAL mode for better concurrency.
 * Automatically runs migrations on startup.
 *
 * @see docs/03-architecture/data-model.md
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';
import { DEFAULT_ROLES } from '@/core/permissions/defaults.js';

const log = createLogger('db');
const config = loadConfig();

/**
 * Ensure the data directory exists
 */
function ensureDataDirectory(dbPath: string): void {
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });
}

/**
 * Create and configure SQLite connection
 */
function createSqliteConnection(dbPath: string): Database.Database {
  ensureDataDirectory(dbPath);

  const sqlite = new Database(dbPath);

  // Configure for performance and reliability
  sqlite.pragma('journal_mode = WAL'); // Write-Ahead Logging for concurrency
  sqlite.pragma('busy_timeout = 5000'); // Wait up to 5 seconds for locks
  sqlite.pragma('synchronous = NORMAL'); // Balance between safety and performance
  sqlite.pragma('foreign_keys = ON'); // Enforce foreign key constraints

  return sqlite;
}

/**
 * Raw SQLite connection (for direct queries if needed)
 */
export const sqlite: DatabaseType = createSqliteConnection(config.database.path);

/**
 * Drizzle ORM instance with schema
 */
export const db = drizzle(sqlite, { schema });

log.info({ path: config.database.path }, 'Database connected');

/**
 * Run database migrations automatically on startup
 */
function runMigrations(): void {
  try {
    // Get migrations folder path (relative to project root)
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const migrationsFolder = resolve(__dirname, '../../migrations');

    // Temporarily disable FK checks — some migrations reference rows
    // (e.g. role IDs) that are seeded after migrations complete.
    sqlite.pragma('foreign_keys = OFF');
    migrate(db, { migrationsFolder });
    sqlite.pragma('foreign_keys = ON');
    log.info('Database migrations applied');
  } catch (error) {
    log.error({ error }, 'Failed to run migrations');
    throw error;
  }
}

// Run migrations on module load
runMigrations();

/**
 * Seed default roles if they don't exist
 * This runs automatically after migrations
 */
function seedDefaultRoles(): void {
  try {
    for (const role of DEFAULT_ROLES) {
      // Check if role already exists
      const existing = db.select().from(schema.roles).where(eq(schema.roles.id, role.id)).get();

      if (!existing) {
        const now = new Date().toISOString();
        db.insert(schema.roles)
          .values({
            id: role.id,
            name: role.name,
            description: role.description,
            permissions: JSON.stringify(role.permissions),
            isSystem: role.isSystem,
            createdAt: now,
            updatedAt: now,
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

// Seed default roles after migrations
seedDefaultRoles();

/**
 * Close the database connection (for graceful shutdown)
 */
export function closeDatabase(): void {
  sqlite.close();
  log.info('Database connection closed');
}

/**
 * Check if database is healthy
 */
export function isDatabaseHealthy(): boolean {
  try {
    sqlite.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

// Re-export schema for convenience
export * from './schema.js';
