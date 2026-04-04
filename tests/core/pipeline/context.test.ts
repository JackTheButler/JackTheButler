/**
 * Pipeline context + runPipeline tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContext, runPipeline } from '@/core/pipeline/context.js';
import type { MessageContext } from '@/core/pipeline/context.js';
import type { InboundMessage } from '@/types/index.js';

const { mockDebug } = vi.hoisted(() => ({ mockDebug: vi.fn() }));
vi.mock('@/utils/logger.js', () => ({
  createLogger: () => ({ debug: mockDebug, info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const testInbound: InboundMessage = {
  id: 'test-msg-001',
  channel: 'webchat',
  channelId: 'test-session',
  content: 'Hello',
  contentType: 'text',
  timestamp: new Date(),
};

describe('createContext', () => {
  it('sets inbound and startTime', () => {
    const before = Date.now();
    const ctx = createContext(testInbound);
    const after = Date.now();

    expect(ctx.inbound).toBe(testInbound);
    expect(ctx.startTime).toBeGreaterThanOrEqual(before);
    expect(ctx.startTime).toBeLessThanOrEqual(after);
  });

  it('starts with no other fields set', () => {
    const ctx = createContext(testInbound);
    expect(ctx.guest).toBeUndefined();
    expect(ctx.conversation).toBeUndefined();
    expect(ctx.done).toBeUndefined();
    expect(ctx.outbound).toBeUndefined();
  });
});

describe('runPipeline', () => {
  beforeEach(() => { mockDebug.mockClear(); });

  it('logs stage name and durationMs for each stage', async () => {
    const ctx = createContext(testInbound);
    async function stageOne(_c: MessageContext) {}
    async function stageTwo(_c: MessageContext) {}

    await runPipeline(ctx, [stageOne, stageTwo]);

    expect(mockDebug).toHaveBeenCalledTimes(2);
    expect(mockDebug).toHaveBeenNthCalledWith(1, { stage: 'stageOne', durationMs: expect.any(Number) }, 'stage complete');
    expect(mockDebug).toHaveBeenNthCalledWith(2, { stage: 'stageTwo', durationMs: expect.any(Number) }, 'stage complete');
  });

  it('does not log for skipped stages when ctx.done is set', async () => {
    const ctx = createContext(testInbound);
    async function first(c: MessageContext) { c.done = true; }
    async function second(_c: MessageContext) {}

    await runPipeline(ctx, [first, second]);

    expect(mockDebug).toHaveBeenCalledTimes(1);
    expect(mockDebug).toHaveBeenCalledWith({ stage: 'first', durationMs: expect.any(Number) }, 'stage complete');
  });

  it('runs stages in order', async () => {
    const order: number[] = [];
    const stages = [
      async (_ctx: MessageContext) => { order.push(1); },
      async (_ctx: MessageContext) => { order.push(2); },
      async (_ctx: MessageContext) => { order.push(3); },
    ];

    const ctx = createContext(testInbound);
    await runPipeline(ctx, stages);

    expect(order).toEqual([1, 2, 3]);
  });

  it('stages can read and write ctx', async () => {
    const ctx = createContext(testInbound);
    await runPipeline(ctx, [
      async (c) => { c.detectedLanguage = 'fr'; },
      async (c) => { c.propertyLanguage = c.detectedLanguage === 'fr' ? 'en' : 'fr'; },
    ]);

    expect(ctx.detectedLanguage).toBe('fr');
    expect(ctx.propertyLanguage).toBe('en');
  });

  it('stops early when ctx.done is set', async () => {
    const ran = vi.fn();
    const ctx = createContext(testInbound);

    await runPipeline(ctx, [
      async (c) => { c.done = true; },
      async (_c) => { ran(); },
    ]);

    expect(ran).not.toHaveBeenCalled();
  });

  it('does not run any stages if ctx.done is already true', async () => {
    const ran = vi.fn();
    const ctx = createContext(testInbound);
    ctx.done = true;

    await runPipeline(ctx, [
      async (_c) => { ran(); },
    ]);

    expect(ran).not.toHaveBeenCalled();
  });

  it('propagates errors from stages', async () => {
    const ctx = createContext(testInbound);
    const boom = new Error('stage exploded');

    await expect(
      runPipeline(ctx, [
        async () => { throw boom; },
      ])
    ).rejects.toThrow('stage exploded');
  });

  it('does not run subsequent stages after an error', async () => {
    const ran = vi.fn();
    const ctx = createContext(testInbound);

    await expect(
      runPipeline(ctx, [
        async () => { throw new Error('fail'); },
        async () => { ran(); },
      ])
    ).rejects.toThrow();

    expect(ran).not.toHaveBeenCalled();
  });

  it('handles an empty stage list', async () => {
    const ctx = createContext(testInbound);
    await expect(runPipeline(ctx, [])).resolves.toBeUndefined();
  });
});
