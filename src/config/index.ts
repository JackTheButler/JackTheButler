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

  // WhatsApp Configuration
  whatsapp: z.object({
    accessToken: z.string().optional(),
    phoneNumberId: z.string().optional(),
    verifyToken: z.string().optional(),
    appSecret: z.string().optional(),
  }),

  // SMS Configuration (Twilio)
  sms: z.object({
    accountSid: z.string().optional(),
    authToken: z.string().optional(),
    phoneNumber: z.string().optional(), // Twilio phone number to send from
  }),

  // Email Configuration
  email: z.object({
    // SMTP settings for sending
    smtpHost: z.string().optional(),
    smtpPort: z.coerce.number().int().default(587),
    smtpSecure: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
    smtpUser: z.string().optional(),
    smtpPass: z.string().optional(),
    fromAddress: z.string().email().optional(),
    fromName: z.string().default('Jack The Butler'),
    // IMAP settings for receiving
    imapHost: z.string().optional(),
    imapPort: z.coerce.number().int().default(993),
    imapSecure: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true),
    imapUser: z.string().optional(),
    imapPass: z.string().optional(),
    // Polling settings
    pollInterval: z.coerce.number().int().min(10).default(60), // seconds
  }),

  // PMS Integration
  pms: z.object({
    provider: z.enum(['mock', 'mews', 'cloudbeds', 'opera', 'apaleo']).default('mock'),
    apiUrl: z.string().optional(),
    apiKey: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    propertyId: z.string().optional(),
    webhookSecret: z.string().optional(),
    syncInterval: z.coerce.number().int().min(60).default(300), // seconds
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
    whatsapp: {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
      appSecret: process.env.WHATSAPP_APP_SECRET,
    },
    sms: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    },
    email: {
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT,
      smtpSecure: process.env.SMTP_SECURE,
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
      fromAddress: process.env.EMAIL_FROM_ADDRESS,
      fromName: process.env.EMAIL_FROM_NAME,
      imapHost: process.env.IMAP_HOST,
      imapPort: process.env.IMAP_PORT,
      imapSecure: process.env.IMAP_SECURE,
      imapUser: process.env.IMAP_USER,
      imapPass: process.env.IMAP_PASS,
      pollInterval: process.env.EMAIL_POLL_INTERVAL,
    },
    pms: {
      provider: process.env.PMS_PROVIDER,
      apiUrl: process.env.PMS_API_URL,
      apiKey: process.env.PMS_API_KEY,
      clientId: process.env.PMS_CLIENT_ID,
      clientSecret: process.env.PMS_CLIENT_SECRET,
      propertyId: process.env.PMS_PROPERTY_ID,
      webhookSecret: process.env.PMS_WEBHOOK_SECRET,
      syncInterval: process.env.PMS_SYNC_INTERVAL,
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
