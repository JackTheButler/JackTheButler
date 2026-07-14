import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { config } from '@/config.js';
import * as schema from '@/db/schema/index.js';

const path = config.dbPath;
if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

export const sqlite: Database.Database = new Database(path);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
