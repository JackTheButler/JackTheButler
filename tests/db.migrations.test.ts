import { describe, it, expect } from 'vitest';
import { getTableName, is, sql } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';

process.env.DB_PATH = ':memory:';

const { runMigrations } = await import('../src/db/migrate.js');
const { db } = await import('../src/db/client.js');
const schema = await import('../src/db/schema/index.js');

/** Migration-sync guardrail: applying the committed migrations to an empty
 *  DB must produce every table declared in the schema. If someone adds a
 *  table to the schema but forgets `pnpm db:generate`, this fails. */
describe('db migrations', () => {
  it('committed migrations create every table in the schema', () => {
    runMigrations();

    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
    );
    const existing = new Set(rows.map((r) => r.name));

    const expected = Object.values(schema)
      .filter((v) => is(v, SQLiteTable))
      .map((t) => getTableName(t as SQLiteTable));

    expect(expected.length).toBeGreaterThan(0);
    for (const table of expected) {
      expect(existing, `table "${table}" missing — did you run pnpm db:generate?`).toContain(
        table,
      );
    }
  });
});
