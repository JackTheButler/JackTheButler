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

/** Web Push (VAPID) keys. Optional — push notifications degrade off cleanly
 *  when unset (the /push/key endpoint reports disabled and subscribe 503s).
 *  Generate with: `npx web-push generate-vapid-keys`. */
function resolveVapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@janetheoperator.com',
  };
}

/** A positive-millisecond env override if set, else the (production-safe)
 *  default. Shortening is always an explicit env choice, never inferred from
 *  the environment — so production is correct regardless of `NODE_ENV`. */
function envMsOrDefault(name: string, defaultMs: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : defaultMs;
}

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

export const config = {
  nodeEnv: NODE_ENV,
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? 'data/app.db',
  jwtSecret: resolveJwtSecret(),
  appConfigKey: resolveAppConfigKey(),
  /** Web Push config, or null when VAPID keys aren't configured. */
  push: resolveVapid(),

  /** Session cookie name. */
  cookieName: 'jane_session',
  /** Token lifetime: 5 days. */
  sessionTtlMs: 5 * 24 * 60 * 60 * 1000,
  /** Re-issue the cookie once the token is older than 1 day (rolling session). */
  sessionRenewAfterMs: 24 * 60 * 60 * 1000,

  /** A conversation reopened within this of its last close resumes the *same*
   *  episode (case); a reopen later starts a new episode. Default 24h.
   *  Override (e.g. for local testing): EPISODE_REOPEN_WINDOW_MS. */
  episodeReopenWindowMs: envMsOrDefault('EPISODE_REOPEN_WINDOW_MS', DAY),
  /** Auto-close an open conversation after this much silence. Distinct concern
   *  from the reopen window. Default 24h. Override: INACTIVITY_AUTOCLOSE_MS. */
  inactivityAutoCloseMs: envMsOrDefault('INACTIVITY_AUTOCLOSE_MS', DAY),
  /** How often the scheduler runs auto-close + the episodes projection (the
   *  windows above only matter once a tick fires). Default hourly.
   *  Override: SCHEDULER_TICK_MS. */
  schedulerTickMs: envMsOrDefault('SCHEDULER_TICK_MS', 60 * MIN),
} as const;
