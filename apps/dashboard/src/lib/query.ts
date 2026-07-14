/**
 * Query utilities for building URLs and managing filtered queries.
 */

/**
 * Build a query string from an object of parameters.
 * Filters out null, undefined, empty strings, and 'all' values.
 *
 * @example
 * buildQueryString({ search: 'john', status: 'active', page: 1 })
 * // Returns: 'search=john&status=active&page=1'
 *
 * buildQueryString({ search: '', status: 'all', limit: 50 })
 * // Returns: 'limit=50'
 */
export function buildQueryString(
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    // Skip null, undefined, empty strings, and 'all' filter values
    if (value === null || value === undefined || value === '' || value === 'all') {
      continue;
    }
    searchParams.set(key, String(value));
  }

  return searchParams.toString();
}

/**
 * Build a full URL path with query string.
 *
 * @example
 * buildUrl('/reservations', { search: 'john', status: 'confirmed' })
 * // Returns: '/reservations?search=john&status=confirmed'
 *
 * buildUrl('/guests', { status: 'all' })
 * // Returns: '/guests'
 */
export function buildUrl(
  path: string,
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const queryString = buildQueryString(params);
  return queryString ? `${path}?${queryString}` : path;
}
