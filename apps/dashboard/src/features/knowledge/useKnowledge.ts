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
    queryFn: () => api.get<{ entries: KnowledgeEntry[] }>('/api/app/knowledge/entries'),
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
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/app/knowledge/entries/${id}`),
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

/* ── Bulk import + duplicate check ─────────────────────────────── */

/** Per-request cap (mirrors the server's BULK_MAX); large files are sent in
 *  sequential batches of this size. */
const BATCH = 200;

export interface DuplicateCheck {
  exists: boolean;
  matchedQuestion?: string;
  similar?: { question: string; score: number };
}
export interface CheckResult {
  mode: 'semantic' | 'exact';
  results: DuplicateCheck[];
}

/** Duplicate-check questions against the KB, batched. Mode degrades to
 *  'exact' if any batch lacked semantic matching (no embedding app). */
export async function checkDuplicates(questions: string[]): Promise<CheckResult> {
  let mode: 'semantic' | 'exact' = 'semantic';
  const results: DuplicateCheck[] = [];
  for (let i = 0; i < questions.length; i += BATCH) {
    const r = await api.post<CheckResult>('/api/app/knowledge/entries/check', {
      questions: questions.slice(i, i + BATCH),
    });
    if (r.mode === 'exact') mode = 'exact';
    results.push(...r.results);
  }
  return { mode, results };
}

export interface BulkResult {
  inserted: number;
  skipped: number;
}

/** Insert entries in sequential batches, reporting progress. Idempotent —
 *  a retried run skips rows already present. */
export async function bulkImport(
  entries: EntryInput[],
  onProgress: (processed: number, total: number) => void,
): Promise<BulkResult> {
  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const r = await api.post<BulkResult>('/api/app/knowledge/entries/bulk', {
      entries: entries.slice(i, i + BATCH),
    });
    inserted += r.inserted;
    skipped += r.skipped;
    onProgress(Math.min(i + BATCH, entries.length), entries.length);
  }
  return { inserted, skipped };
}

export type TopK = 3 | 5 | 8 | 10;
export const TOP_K_OPTIONS: readonly TopK[] = [3, 5, 8, 10];

/** Match strictness is a continuous cosine floor; keep these in sync with the
 *  backend bounds in modules/knowledge/service.ts. */
export const MATCH_THRESHOLD_MIN = 0.2;
export const MATCH_THRESHOLD_MAX = 0.7;
export const MATCH_THRESHOLD_STEP = 0.01;

export interface KbSettings {
  matchThreshold: number;
  topK: TopK;
}

/** KB retrieval settings (match threshold + top-K). */
export function useKbSettings() {
  return useQuery({
    queryKey: ['knowledge', 'settings'],
    queryFn: () => api.get<KbSettings>('/api/app/knowledge/settings'),
  });
}

export function useSetMatchThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (matchThreshold: number) =>
      api.put<KbSettings>('/api/app/knowledge/settings', { matchThreshold }),
    onSuccess: (data) => qc.setQueryData(['knowledge', 'settings'], data),
  });
}

export function useSetTopK() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topK: TopK) => api.put<KbSettings>('/api/app/knowledge/settings', { topK }),
    onSuccess: (data) => qc.setQueryData(['knowledge', 'settings'], data),
  });
}
