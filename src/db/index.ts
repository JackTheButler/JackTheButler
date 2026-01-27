/**
 * Database Layer
 *
 * SQLite database connection with Drizzle ORM.
 * Configured with WAL mode for better concurrency.
 *
 * @see docs/03-architecture/data-model.md
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';

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
