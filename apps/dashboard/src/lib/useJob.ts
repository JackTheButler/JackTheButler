import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRealtimeEvent } from '@/lib/realtime';

/**
 * Track a background job's progress. Seeds from `GET /jobs/:id` (so a tab
 * that loads mid-job, or one that just started one, has immediate state),
 * then updates live from `job.progress` realtime events.
 *
 * Generic — any feature that runs a job via `startJob` on the server uses
 * this with the returned job id.
 */
export interface JobSnapshot {
  id: string;
  type: string;
  state: 'running' | 'done' | 'error' | 'cancelled';
  processed: number;
  total: number;
  error?: string;
}

export function useJob(jobId: string | null): JobSnapshot | null {
  const [job, setJob] = useState<JobSnapshot | null>(null);

  // Seed (and re-seed when the tracked id changes).
  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    let alive = true;
    api
      .get<JobSnapshot>(`/api/app/jobs/${jobId}`)
      .then((j) => alive && setJob(j))
      .catch(() => {
        /* job not found / already evicted — leave as-is */
      });
    return () => {
      alive = false;
    };
  }, [jobId]);

  // Live updates for the tracked job.
  useRealtimeEvent<JobSnapshot>('job.progress', (data) => {
    if (jobId && data.id === jobId) setJob(data);
  });

  return job;
}

export async function cancelJob(jobId: string): Promise<void> {
  await api.post(`/api/app/jobs/${jobId}/cancel`);
}
