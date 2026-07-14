import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqlite } from '@/db/client.js';

/**
 * Apply all pending migrations. Idempotent.
 *
 * Foreign keys are disabled for the duration: SQLite table-rebuild migrations
 * (drizzle's recipe for column changes — create `__new_x`, copy, DROP `x`,
 * rename) trip FK constraints when another table references the one being
 * rebuilt. The migration's own `PRAGMA foreign_keys=OFF` is a no-op because
 * drizzle runs migrations inside a transaction (the pragma can't change
 * mid-transaction), so we toggle it here, outside the transaction, via
 * better-sqlite3's dedicated `.pragma()`.
 */
export function runMigrations(): void {
  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(db, { migrationsFolder: 'drizzle' });
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
}

// `pnpm db:migrate` entrypoint.
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
  // eslint-disable-next-line no-console
  console.log('Migrations applied.');
}
