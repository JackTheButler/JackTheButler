import { logger } from '@/core/logger.js';

/**
 * Minimal periodic-task runner for recurring background work (inactivity
 * auto-close, the episodes projection). Started from `index.ts` only — never
 * from `app.ts` — so tests and the composition root stay side-effect free.
 *
 * Single-replica model: tasks must be idempotent (the projection upserts; the
 * auto-close skips already-closed). A missed tick is caught up on the next run.
 */

export interface ScheduledTask {
  name: string;
  intervalMs: number;
  run: () => void | Promise<void>;
}

const handles: ReturnType<typeof setInterval>[] = [];

export function startScheduler(tasks: ScheduledTask[]): void {
  for (const task of tasks) {
    // Overlap guard: a tick is skipped while the previous run is still in
    // flight, so a task slower than its interval can't stack up or run
    // concurrently with itself.
    let running = false;
    const tick = async () => {
      if (running) {
        logger.warn({ task: task.name }, 'scheduled task still running — skipping tick');
        return;
      }
      running = true;
      try {
        await task.run();
      } catch (err) {
        logger.error({ err, task: task.name }, 'scheduled task failed');
      } finally {
        running = false;
      }
    };
    void tick(); // catch up immediately on boot, then on the interval
    handles.push(setInterval(tick, task.intervalMs));
  }
}

export function stopScheduler(): void {
  for (const h of handles) clearInterval(h);
  handles.length = 0;
}
