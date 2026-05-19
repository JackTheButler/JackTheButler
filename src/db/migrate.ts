import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from '@/db/client.js';

/** Apply all pending migrations. Idempotent. */
export function runMigrations(): void {
  migrate(db, { migrationsFolder: 'drizzle' });
}

// `pnpm db:migrate` entrypoint.
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
  // eslint-disable-next-line no-console
  console.log('Migrations applied.');
}
