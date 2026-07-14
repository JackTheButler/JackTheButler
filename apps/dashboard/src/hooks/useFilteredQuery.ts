import { useQuery, keepPreviousData, UseQueryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { buildUrl } from '@/lib/query';

type QueryParams = Record<string, string | number | boolean | null | undefined>;

interface UseFilteredQueryOptions<TData> {
  /** Base query key (e.g., 'reservations', 'guests') */
  queryKey: string;
  /** API endpoint path (e.g., '/reservations', '/guests') */
  endpoint: string;
  /** Query parameters to include in the request */
  params?: QueryParams;
  /** Refetch interval in milliseconds */
  refetchInterval?: number;
  /** Additional query options */
  options?: Omit<UseQueryOptions<TData>, 'queryKey' | 'queryFn'>;
}

/**
 * A wrapper around useQuery that handles common filtered query patterns.
 *
 * @example
 * const { data, isLoading } = useFilteredQuery<{ reservations: Reservation[] }>({
 *   queryKey: 'reservations',
 *   endpoint: '/reservations',
 *   params: { status: statusFilter, limit: 50 },
 *   refetchInterval: 10000,
 * });
 */
export function useFilteredQuery<TData>({
  queryKey,
  endpoint,
  params = {},
  refetchInterval,
  options,
}: UseFilteredQueryOptions<TData>) {
  // Build query key that includes all params for proper cache invalidation
  const fullQueryKey = [queryKey, params];

  return useQuery<TData>({
    queryKey: fullQueryKey,
    queryFn: () => api.get<TData>(buildUrl(endpoint, params)),
    placeholderData: keepPreviousData,
    refetchInterval,
    ...options,
  });
}
