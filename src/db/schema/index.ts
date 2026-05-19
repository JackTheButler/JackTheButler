/**
 * Schema barrel. Every domain adds its table file here and re-exports it so
 * the Drizzle client (and the migration-sync guardrail) sees every table.
 */
export * from './staff.js';
export * from './customers.js';
export * from './conversations.js';
export * from './messages.js';
export * from './app_configs.js';
