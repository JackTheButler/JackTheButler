/**
 * Database Layer
 *
 * SQLite database connection with Drizzle ORM.
 * Configured with WAL mode for better concurrency.
 *
 * Connection, sqlite-vec loading, and migrations are performed lazily:
 * the first time `db` or `sqlite` is touched (or when `initDb()` is called
 * explicitly), this module reads the current config and connects. This
 * avoids "import order magic" — a module importing `{ db }` no longer
 * decides, by virtue of being the first importer, what env the DB was
 * created under. Callers get a live connection whenever they actually use
 * it, initialized against whatever env is active at that moment.
 *
 * `initDb()` is exported for callers that want deterministic timing (the
 * composition root in src/index.ts, and tests/setup.ts) and is idempotent
 * — safe to call more than once.
 *
 * This module is intentionally domain-free: it does not seed any
 * application data (e.g. default roles). See src/core/permissions/seed.ts.
 *
 * @see docs/03-architecture/data-model.md
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('db');

type DrizzleDb = BetterSQLite3Database<typeof schema>;

let sqliteInstance: DatabaseType | null = null;
let dbInstance: DrizzleDb | null = null;

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
function createSqliteConnection(dbPath: string): DatabaseType {
  ensureDataDirectory(dbPath);

  const connection = new Database(dbPath);

  // Configure for performance and reliability
  connection.pragma('journal_mode = WAL'); // Write-Ahead Logging for concurrency
  connection.pragma('busy_timeout = 5000'); // Wait up to 5 seconds for locks
  connection.pragma('synchronous = NORMAL'); // Balance between safety and performance
  connection.pragma('foreign_keys = ON'); // Enforce foreign key constraints

  return connection;
}

/**
 * Run database migrations automatically
 */
function runMigrations(connection: DatabaseType, drizzleDb: DrizzleDb): void {
  try {
    // Get migrations folder path (relative to project root)
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const migrationsFolder = resolve(__dirname, '../../migrations');

    // Temporarily disable FK checks — some migrations reference rows
    // (e.g. role IDs) that are seeded after migrations complete.
    connection.pragma('foreign_keys = OFF');
    migrate(drizzleDb, { migrationsFolder });
    connection.pragma('foreign_keys = ON');
    log.info('Database migrations applied');
  } catch (error) {
    log.error({ error }, 'Failed to run migrations');
    throw error;
  }
}

/**
 * Initialize the database connection: connect, load sqlite-vec, run
 * migrations. Idempotent — subsequent calls are no-ops as long as the
 * connection is still open.
 */
export function initDb(): void {
  if (dbInstance && sqliteInstance) {
    return;
  }

  const config = loadConfig();

  const connection = createSqliteConnection(config.database.path);
  sqliteVec.load(connection);
  const drizzleDb = drizzle(connection, { schema });

  log.info({ path: config.database.path }, 'Database connected');

  runMigrations(connection, drizzleDb);

  sqliteInstance = connection;
  dbInstance = drizzleDb;
}

/**
 * Bind a function-valued property to its real owner so native bindings
 * (better-sqlite3) and internal `this` usage keep working when accessed
 * through the lazy proxies below.
 */
function createLazyProxy<T extends object>(getTarget: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop, _receiver) {
      const target = getTarget();
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(_target, prop, value) {
      const target = getTarget();
      return Reflect.set(target, prop, value, target);
    },
    has(_target, prop) {
      return Reflect.has(getTarget(), prop);
    },
    ownKeys(_target) {
      return Reflect.ownKeys(getTarget());
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(getTarget(), prop);
    },
    // Without these two traps, `Object.defineProperty`/`delete` (e.g. from
    // `vi.spyOn`/`vi.restoreAllMocks` in tests) would silently apply to this
    // Proxy's own inert internal target instead of the real db/sqlite
    // instance, so mocks would appear to install but never actually run.
    defineProperty(_target, prop, descriptor) {
      return Reflect.defineProperty(getTarget(), prop, descriptor);
    },
    deleteProperty(_target, prop) {
      return Reflect.deleteProperty(getTarget(), prop);
    },
    getPrototypeOf(_target) {
      return Reflect.getPrototypeOf(getTarget());
    },
  });
}

/**
 * Raw SQLite connection (for direct queries if needed).
 * Auto-initializes (connect + sqlite-vec + migrate) on first access.
 */
export const sqlite: DatabaseType = createLazyProxy<DatabaseType>(() => {
  if (!sqliteInstance) {
    initDb();
  }
  return sqliteInstance!;
});

/**
 * Drizzle ORM instance with schema.
 * Auto-initializes (connect + sqlite-vec + migrate) on first access.
 */
export const db: DrizzleDb = createLazyProxy<DrizzleDb>(() => {
  if (!dbInstance) {
    initDb();
  }
  return dbInstance!;
});

/**
 * Close the database connection (for graceful shutdown)
 */
export function closeDatabase(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    log.info('Database connection closed');
  }
  sqliteInstance = null;
  dbInstance = null;
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
