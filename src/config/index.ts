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

  // AI Configuration
  ai: z.object({
    provider: z.enum(['claude', 'openai', 'ollama']).default('claude'),
    anthropicApiKey: z.string().optional(),
    openaiApiKey: z.string().optional(),
    ollamaBaseUrl: z.string().default('http://localhost:11434'),
    model: z.string().optional(),
    embeddingModel: z.string().optional(),
    maxTokens: z.coerce.number().int().min(1).max(8192).default(1024),
    temperature: z.coerce.number().min(0).max(2).default(0.7),
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
    database: {
      path: process.env.DATABASE_PATH,
    },
    log: {
      level: process.env.LOG_LEVEL,
    },
    jwt: {
      secret: process.env.JWT_SECRET,
    },
    ai: {
      provider: process.env.AI_PROVIDER,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
      model: process.env.AI_MODEL,
      embeddingModel: process.env.AI_EMBEDDING_MODEL,
      maxTokens: process.env.AI_MAX_TOKENS,
      temperature: process.env.AI_TEMPERATURE,
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
