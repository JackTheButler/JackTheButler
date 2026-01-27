/**
 * Drizzle Kit Configuration
 *
 * Used for generating and running database migrations.
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH || './data/jack.db',
  },
  verbose: true,
  strict: true,
});
