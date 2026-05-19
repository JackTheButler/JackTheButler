/** Central runtime config. Read once at import. */

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isProduction = NODE_ENV === 'production';

function resolveJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 16) return s;
  if (isProduction) {
    throw new Error('JWT_SECRET must be set (>= 16 chars) in production');
  }
  // Dev/test only — deterministic so tokens survive a restart locally.
  return 'dev-insecure-secret-change-me-please';
}

function resolveAppConfigKey(): string {
  const s = process.env.APP_CONFIG_KEY;
  if (s && s.length >= 16) return s;
  if (isProduction) {
    throw new Error('APP_CONFIG_KEY must be set (>= 16 chars) in production');
  }
  // Dev/test only — deterministic so stored app configs decrypt after restart.
  return 'dev-insecure-app-config-key-change-me';
}

export const config = {
  nodeEnv: NODE_ENV,
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? 'data/app.db',
  jwtSecret: resolveJwtSecret(),
  appConfigKey: resolveAppConfigKey(),

  /** Session cookie name. */
  cookieName: 'jane_session',
  /** Token lifetime: 5 days. */
  sessionTtlMs: 5 * 24 * 60 * 60 * 1000,
  /** Re-issue the cookie once the token is older than 1 day (rolling session). */
  sessionRenewAfterMs: 24 * 60 * 60 * 1000,
} as const;
