import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KnowledgeEntry } from '@janetheoperator/shared';
import { api } from '@/lib/api';

/** Knowledge base data layer. */

const KEY = ['knowledge'] as const;

export interface EntryInput {
  question: string;
  answer: string;
  topic: string | null;
}

export function useKnowledgeEntries() {
  return useQuery({
    queryKey: KEY,
    queryFn: () =>
      api.get<{ entries: KnowledgeEntry[] }>('/api/app/knowledge/entries'),
  });
}

export function useAddEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EntryInput) =>
      api.post<KnowledgeEntry>('/api/app/knowledge/entries', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: EntryInput & { id: string }) =>
      api.put<KnowledgeEntry>(`/api/app/knowledge/entries/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ ok: true }>(`/api/app/knowledge/entries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Embedding counts: `missing` (not searchable) + `total` (approved). */
export function useEmbeddingCounts() {
  return useQuery({
    queryKey: ['knowledge', 'embedding-counts'],
    queryFn: () =>
      api.get<{ missing: number; total: number }>('/api/app/knowledge/embedding-counts'),
  });
}

/** Start (or rejoin) the re-embed job. `scope='all'` re-embeds every entry
 *  (after a model/scheme change); default backfills only missing ones. */
export function useReembed() {
  return useMutation({
    mutationFn: (scope: 'missing' | 'all' = 'missing') =>
      api.post<{ id: string; state: string }>(
        `/api/app/knowledge/reembed${scope === 'all' ? '?scope=all' : ''}`,
      ),
  });
}

export type MatchStrictness = 'loose' | 'balanced' | 'strict';

/** KB retrieval match-strictness setting. */
export function useKbSettings() {
  return useQuery({
    queryKey: ['knowledge', 'settings'],
    queryFn: () => api.get<{ matchStrictness: MatchStrictness }>('/api/app/knowledge/settings'),
  });
}

export function useSetMatchStrictness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (matchStrictness: MatchStrictness) =>
      api.put<{ matchStrictness: MatchStrictness }>('/api/app/knowledge/settings', {
        matchStrictness,
      }),
    onSuccess: (data) => qc.setQueryData(['knowledge', 'settings'], data),
  });
}
