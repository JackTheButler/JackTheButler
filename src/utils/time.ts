/**
 * Time Utilities
 *
 * Centralised timestamp helpers so the format and source of truth
 * for "now" is in one place.
 */

/**
 * Returns the current UTC time as an ISO-8601 string.
 * Use this everywhere instead of `new Date().toISOString()`.
 */
export function now(): string {
  return new Date().toISOString();
}
