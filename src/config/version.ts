/**
 * Application version
 *
 * Reads from APP_VERSION env var (set via Docker build arg),
 * falls back to 'dev' for local development.
 */
export function getVersion(): string {
  return process.env.APP_VERSION || 'dev';
}
