import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { events } from '@/core/events.js';
import { AppError } from '@/core/errors.js';

/**
 * Minimal in-process background-job engine with progress + cancellation.
 *
 * Cross-cutting infra (like core/events.ts and core/realtime.ts). A "job"
 * is detached work that reports progress: `startJob` returns immediately so
 * the HTTP request never blocks/timeouts; the work runs in the background
 * and emits `job.progress` on the event bus, which realtime.ts forwards to
 * dashboards.
 *
 * The contract every job MUST honour (this is what makes in-memory state
 * safe on a single replica):
 *   - write results to domain tables incrementally, and
 *   - be safe to re-run (idempotent or skip-already-done),
 * so a server restart mid-run loses only the (cosmetic) progress counter —
 * the work itself is durable and a re-run finishes the remainder.
 *
 * Deliberately minimal: no persistence, no history, no retries, no
 * scheduling. Expand only when a real need appears (e.g. multi-replica →
 * a jobs table).
 */

export type JobState = 'running' | 'done' | 'error' | 'cancelled';

/** Public snapshot sent to clients + returned from queries. */
export interface Job {
  id: string;
  type: string;
  state: JobState;
  processed: number;
  total: number;
  error?: string;
}

interface JobRecord extends Job {
  cancelRequested: boolean;
}

/** What a job's `run` function receives to report progress + observe cancel. */
export interface JobContext {
  /** Advance the processed count by `n` (default 1) and emit progress. */
  tick(n?: number): void;
  /** True once `cancelJob` was called. Long jobs should check this between
   *  steps and return early; the engine then marks the job 'cancelled'. */
  readonly cancelled: boolean;
}

const registry = new Map<string, JobRecord>();

function snapshot(r: JobRecord): Job {
  return {
    id: r.id,
    type: r.type,
    state: r.state,
    processed: r.processed,
    total: r.total,
    ...(r.error !== undefined && { error: r.error }),
  };
}

function emit(r: JobRecord): void {
  events.emit('job.progress', snapshot(r));
}

/**
 * Start a background job. Returns the initial snapshot (with its id) so the
 * route can hand back `{ jobId }`. `run` executes detached.
 */
export function startJob(
  type: string,
  total: number,
  run: (ctx: JobContext) => Promise<void>,
): Job {
  const rec: JobRecord = {
    id: randomUUID(),
    type,
    state: 'running',
    processed: 0,
    total,
    cancelRequested: false,
  };
  registry.set(rec.id, rec);
  emit(rec);

  const ctx: JobContext = {
    tick: (n = 1) => {
      rec.processed += n;
      emit(rec);
    },
    get cancelled() {
      return rec.cancelRequested;
    },
  };

  void run(ctx)
    .then(() => {
      rec.state = rec.cancelRequested ? 'cancelled' : 'done';
      emit(rec);
    })
    .catch((err: unknown) => {
      rec.state = 'error';
      rec.error = err instanceof Error ? err.message : 'job failed';
      emit(rec);
    });

  return snapshot(rec);
}

export function getJob(id: string): Job | undefined {
  const r = registry.get(id);
  return r ? snapshot(r) : undefined;
}

/** The running job of a given type, if any — used to guard double-starts
 *  and to let a freshly-loaded UI reconnect to an in-flight job. */
export function activeJobOfType(type: string): Job | undefined {
  for (const r of registry.values()) {
    if (r.type === type && r.state === 'running') return snapshot(r);
  }
  return undefined;
}

/** Request cancellation. The running job notices on its next `ctx.cancelled`
 *  check and stops; the engine then transitions it to 'cancelled'. */
export function cancelJob(id: string): void {
  const r = registry.get(id);
  if (r && r.state === 'running') r.cancelRequested = true;
}

/**
 * HTTP adapter for the engine — status (initial load / reconnect) + cancel.
 * Lives here (core infra) rather than as a business module: jobs aren't a
 * domain feature, same as `registerDashboardSocket` living in core/realtime.
 * Live progress arrives over the realtime socket as `job.progress`.
 */
export const jobRoutes = new Hono();

jobRoutes.get('/:id', (c) => {
  const job = getJob(c.req.param('id'));
  if (!job) throw new AppError('job_not_found', 404);
  return c.json(job);
});

jobRoutes.post('/:id/cancel', (c) => {
  cancelJob(c.req.param('id'));
  const job = getJob(c.req.param('id'));
  if (!job) throw new AppError('job_not_found', 404);
  return c.json(job);
});
