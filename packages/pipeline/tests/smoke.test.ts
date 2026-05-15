/**
 * End-to-end smoke tests. Wires up all-stub services and verifies the
 * pipeline produces an outbound message with the default stage list.
 */

import { describe, it, expect } from 'vitest';
import {
  createPipeline,
  defaultStages,
  PipelineError,
  type InboundMessage,
} from '../src/index.js';
import {
  createStubIntents,
  createStubPrompts,
  createStubServices,
  createStubAI,
} from './_helpers/stubs.js';

function makeInbound(over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: 'msg-1',
    channel: 'webchat',
    channelId: 'sess-1',
    content: 'hello',
    createdAt: new Date(),
    ...over,
  };
}

describe('createPipeline — smoke', () => {
  it('produces an outbound with defaults and stub services', async () => {
    const pipeline = createPipeline({
      intents: createStubIntents(),
      prompts: createStubPrompts(),
      services: createStubServices(),
    });

    const ctx = await pipeline.process(makeInbound());

    expect(ctx.outbound.content).toBeTruthy();
    expect(ctx.outbound.conversationId).toBeTruthy();
    expect(ctx.outbound.id).toBeTruthy();
    expect(ctx.outbound.createdAt).toBeInstanceOf(Date);
  });

  it('defaults to systemLanguage="en" when not provided', async () => {
    const ai = createStubAI();
    const pipeline = createPipeline({
      intents: createStubIntents(),
      prompts: createStubPrompts(),
      services: createStubServices({ ai }),
    });

    await pipeline.process(makeInbound());

    // The detect-language stub returns 'en' which equals systemLanguage,
    // so the translator stages should not call ai.complete with translation.
    const translationCalls = (ai.complete as unknown as { mock: { calls: unknown[][] } })
      .mock.calls.filter((c) => {
        const req = c[0] as { purpose?: string };
        return req.purpose === 'translation';
      });
    expect(translationCalls).toHaveLength(0);
  });

  it('uses defaultStages when stages is omitted', async () => {
    const pipeline = createPipeline({
      intents: createStubIntents(),
      prompts: createStubPrompts(),
      services: createStubServices(),
    });

    // Should not throw — defaults include save-outbound, which sets ctx.outbound
    await expect(pipeline.process(makeInbound())).resolves.toBeDefined();
  });

  it('throws PipelineError when stages produce no outbound', async () => {
    const pipeline = createPipeline({
      intents: createStubIntents(),
      prompts: createStubPrompts(),
      services: createStubServices(),
      stages: [], // empty — nothing sets ctx.outbound
    });

    await expect(pipeline.process(makeInbound())).rejects.toBeInstanceOf(
      PipelineError,
    );
    await expect(pipeline.process(makeInbound())).rejects.toThrow(
      /Pipeline finished without/,
    );
  });

  it('PipelineError carries the partial ctx for failure-path event emission', async () => {
    const originalError = new Error('boom');
    const failingStage = async () => {
      throw originalError;
    };
    const pipeline = createPipeline({
      intents: createStubIntents(),
      prompts: createStubPrompts(),
      services: createStubServices(),
      stages: [...defaultStages.slice(0, 1), failingStage], // resolveConversation then boom
    });

    let caught: unknown;
    try {
      await pipeline.process(makeInbound());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PipelineError);
    if (caught instanceof PipelineError) {
      // ctx state up to the point of failure is preserved
      expect(caught.ctx.inbound.id).toBe('msg-1');
      expect(caught.ctx.startTime).toEqual(expect.any(Number));
      expect(caught.ctx.conversation).toBeDefined(); // resolveConversation ran
      // cause is the exact original error, not a wrapped copy
      expect(caught.cause).toBe(originalError);
      expect((caught.cause as Error).message).toBe('boom');
      // PipelineError.message mirrors the cause's message
      expect(caught.message).toBe('boom');
    }
  });

  it('PipelineError carries ctx.savedInboundId when failure happens after saveInboundMessage', async () => {
    // resolveConversation + saveInboundMessage run (5 stages of defaultStages
    // up to and including saveInboundMessage), then boom.
    const failingStage = async () => {
      throw new Error('post-save boom');
    };
    const saveInboundIndex = defaultStages.findIndex((s) => s.name === 'saveInboundMessage');
    const stages = [
      ...defaultStages.slice(0, saveInboundIndex + 1),
      failingStage,
    ];

    const pipeline = createPipeline({
      intents: createStubIntents(),
      prompts: createStubPrompts(),
      services: createStubServices(),
      stages,
    });

    let caught: unknown;
    try {
      await pipeline.process(makeInbound());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PipelineError);
    if (caught instanceof PipelineError) {
      expect(caught.ctx.conversation).toBeDefined();
      expect(caught.ctx.savedInboundId).toBeTruthy();
    }
  });

  it('PipelineError from the no-outbound path also carries ctx', async () => {
    const pipeline = createPipeline({
      intents: createStubIntents(),
      prompts: createStubPrompts(),
      services: createStubServices(),
      stages: [...defaultStages.slice(0, 1)], // only resolveConversation; never sets outbound
    });

    let caught: unknown;
    try {
      await pipeline.process(makeInbound());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PipelineError);
    if (caught instanceof PipelineError) {
      expect(caught.ctx.conversation).toBeDefined();
      expect(caught.ctx.outbound).toBeUndefined();
      expect((caught.cause as Error).message).toMatch(/Pipeline finished without/);
    }
  });

  it('does not double-wrap when a stage explicitly throws a PipelineError', async () => {
    const innerCtx = { inbound: makeInbound(), startTime: 0 };
    const innerErr = new PipelineError(new Error('inner'), innerCtx);
    const rethrowing = async () => {
      throw innerErr;
    };

    const pipeline = createPipeline({
      intents: createStubIntents(),
      prompts: createStubPrompts(),
      services: createStubServices(),
      stages: [rethrowing],
    });

    let caught: unknown;
    try {
      await pipeline.process(makeInbound());
    } catch (err) {
      caught = err;
    }
    // The thrown PipelineError passes through unchanged — same reference,
    // not re-wrapped as `cause` of another PipelineError.
    expect(caught).toBe(innerErr);
  });

  it('respects ctx.done short-circuit', async () => {
    const stages = [
      ...defaultStages.slice(0, 1), // resolveConversation
      // A stage that short-circuits before any persistence happens
      async (ctx: { done?: boolean; outbound?: { content: string; conversationId: string; id: string; createdAt: Date } }) => {
        ctx.done = true;
        // Manually set outbound to make the pipeline succeed
        ctx.outbound = {
          id: 'short-circuit',
          conversationId: 'conv-stub',
          content: 'short-circuited',
          createdAt: new Date(),
        };
      },
      // The rest of defaults — should NOT run
      ...defaultStages.slice(1),
    ];

    const pipeline = createPipeline({
      intents: createStubIntents(),
      prompts: createStubPrompts(),
      services: createStubServices(),
      stages,
    });

    const ctx = await pipeline.process(makeInbound());
    expect(ctx.outbound.content).toBe('short-circuited');
  });
});

describe('createPipeline — optional services', () => {
  it('skips knowledge + memory stages when their services are absent', async () => {
    const ai = createStubAI();
    const pipeline = createPipeline({
      intents: createStubIntents(),
      prompts: createStubPrompts(),
      services: createStubServices({ ai }), // no knowledge, no memory
    });

    await pipeline.process(makeInbound());

    // computeEmbedding skips when neither knowledge nor memory is configured,
    // so embed() should not be called.
    expect(ai.embed).not.toHaveBeenCalled();
  });
});
