import { describe, it, expect, vi } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';

const { startJob, getJob, activeJobOfType, cancelJob } = await import('../src/core/jobs.js');
const { events } = await import('../src/core/events.js');

/** Wait until the job reaches a terminal state (poll the registry). */
async function settle(id: string, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const j = getJob(id);
    if (j && j.state !== 'running') return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('job did not settle');
}

describe('job engine', () => {
  it('runs to completion, ticking progress + emitting job.progress', async () => {
    const seen: number[] = [];
    const off = events.on('job.progress', (j) => {
      if (j.type === 'test-run') seen.push(j.processed);
    });

    const job = startJob('test-run', 3, async (ctx) => {
      for (let i = 0; i < 3; i++) ctx.tick();
    });
    expect(job.state).toBe('running');
    expect(job.total).toBe(3);

    await settle(job.id);
    off();

    const final = getJob(job.id)!;
    expect(final.state).toBe('done');
    expect(final.processed).toBe(3);
    // Progress was emitted (start + 3 ticks + done): processed values seen.
    expect(seen).toContain(3);
  });

  it('marks state=error when the run throws', async () => {
    const job = startJob('test-error', 1, async () => {
      throw new Error('boom');
    });
    await settle(job.id);
    const final = getJob(job.id)!;
    expect(final.state).toBe('error');
    expect(final.error).toBe('boom');
  });

  it('cancels: run observes ctx.cancelled and the job ends cancelled', async () => {
    let observedCancel = false;
    const job = startJob('test-cancel', 100, async (ctx) => {
      for (let i = 0; i < 100; i++) {
        if (ctx.cancelled) {
          observedCancel = true;
          return;
        }
        ctx.tick();
        await new Promise((r) => setTimeout(r, 5));
      }
    });
    // Cancel after the first couple of ticks.
    await new Promise((r) => setTimeout(r, 12));
    cancelJob(job.id);
    await settle(job.id);

    const final = getJob(job.id)!;
    expect(observedCancel).toBe(true);
    expect(final.state).toBe('cancelled');
    expect(final.processed).toBeLessThan(100);
  });

  it('activeJobOfType finds a running job and ignores finished ones', async () => {
    const job = startJob('test-active', 1, async (ctx) => {
      await new Promise((r) => setTimeout(r, 20));
      ctx.tick();
    });
    expect(activeJobOfType('test-active')?.id).toBe(job.id);
    await settle(job.id);
    expect(activeJobOfType('test-active')).toBeUndefined();
  });
});
