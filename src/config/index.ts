/**
 * Configuration
 *
 * Loads and validates configuration from environment variables.
 * Uses Zod for schema validation.
 */

import { z } from 'zod';

/**
 * Configuration schema with validation
 */
const configSchema = z.object({
  // Environment
  env: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().min(1).max(65535).default(3000),

  // Demo mode (set DEMO_MODE=true for hosted demo deployments)
  demoMode: z.string().optional().transform(v => v === 'true'),

  // Database
  database: z.object({
    path: z.string().default('./data/jack.db'),
  }),

  // Logging
  log: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),

  // JWT Authentication
  jwt: z.object({
    secret: z
      .string()
      .min(32, 'JWT secret must be at least 32 characters')
      .default('development-secret-change-in-production-min-32-chars'),
  }),

  // Encryption (for storing credentials in DB)
  encryption: z.object({
    key: z
      .string()
      .min(32, 'Encryption key must be at least 32 characters')
      .default('development-encryption-key-change-in-production'),
  }),

});

/**
 * Application configuration type
 */
export type Config = z.infer<typeof configSchema>;

/**
 * Cached configuration instance
 */
let cachedConfig: Config | null = null;

/**
 * Load and validate configuration from environment variables.
 *
 * @returns Validated configuration object
 * @throws {ZodError} If configuration is invalid
 */
export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const rawConfig = {
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    demoMode: process.env.DEMO_MODE,
    database: {
      path: process.env.DATABASE_PATH,
    },
    log: {
      level: process.env.LOG_LEVEL,
    },
    jwt: {
      secret: process.env.JWT_SECRET,
    },
    encryption: {
      key: process.env.ENCRYPTION_KEY,
    },
  };

  cachedConfig = configSchema.parse(rawConfig);
  return cachedConfig;
}

/**
 * Reset cached configuration (useful for testing)
 */
export function resetConfig(): void {
  cachedConfig = null;
}

/**
 * Get current environment
 */
export function getEnv(): Config['env'] {
  return loadConfig().env;
}

/**
 * Check if running in development mode
 */
export function isDev(): boolean {
  return getEnv() === 'development';
}

/**
 * Check if running in production mode
 */
export function isProd(): boolean {
  return getEnv() === 'production';
}

/**
 * Check if running in test mode
 */
export function isTest(): boolean {
  return getEnv() === 'test';
}

/**
 * Check if running in demo mode
 */
export function isDemo(): boolean {
  return loadConfig().demoMode;
}
