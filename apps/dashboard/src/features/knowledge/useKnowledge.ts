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

/** How many entries aren't searchable yet (missing an embedding). */
export function useMissingCount() {
  return useQuery({
    queryKey: ['knowledge', 'missing'],
    queryFn: () => api.get<{ missing: number }>('/api/app/knowledge/missing-count'),
  });
}

/** Start (or rejoin) the re-embed-missing job; returns the Job snapshot. */
export function useReembed() {
  return useMutation({
    mutationFn: () =>
      api.post<{ id: string; state: string }>('/api/app/knowledge/reembed'),
  });
}
