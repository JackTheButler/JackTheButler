/**
 * App Instrumentation Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, appLogs } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import {
  writeAppLog,
  createAppLogger,
  withLogContext,
  AppLogError,
} from '@/monitoring/instrumentation.js';

async function rowsFor(appId: string, providerId: string, eventType: string) {
  return db
    .select()
    .from(appLogs)
    .where(eq(appLogs.eventType, eventType))
    .then((rows) => rows.filter((r) => r.appId === appId && r.providerId === providerId));
}

describe('writeAppLog', () => {
  it('inserts a success row with serialized details', async () => {
    const eventType = `test-write-success-${Date.now()}`;
    writeAppLog('ai', 'anthropic', eventType, 'success', { model: 'claude' }, undefined, 42);

    const rows = await rowsFor('ai', 'anthropic', eventType);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('success');
    expect(rows[0]!.errorMessage).toBeNull();
    expect(rows[0]!.latencyMs).toBe(42);
    expect(JSON.parse(rows[0]!.details as string)).toEqual({ model: 'claude' });
    expect(rows[0]!.id).toBeTruthy();
    expect(rows[0]!.createdAt).toBeTruthy();
  });

  it('inserts a failed row with an error message', async () => {
    const eventType = `test-write-failed-${Date.now()}`;
    writeAppLog('channel', 'twilio', eventType, 'failed', { to: '+1555' }, 'boom', 7);

    const rows = await rowsFor('channel', 'twilio', eventType);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.errorMessage).toBe('boom');
    expect(rows[0]!.latencyMs).toBe(7);
  });
});

describe('withLogContext', () => {
  it('tags an object result with extra details invisibly', () => {
    const result = { id: 'abc' };
    const tagged = withLogContext(result, { httpStatus: 200 });

    expect(tagged).toBe(result); // same reference
    expect(Object.keys(tagged)).toEqual(['id']); // non-enumerable
    expect(JSON.stringify(tagged)).toBe('{"id":"abc"}'); // invisible to JSON
  });

  it('silently ignores primitives', () => {
    expect(() => withLogContext('a string', { foo: 'bar' })).not.toThrow();
    expect(() => withLogContext(42, { foo: 'bar' })).not.toThrow();
    expect(() => withLogContext(null, { foo: 'bar' })).not.toThrow();
    expect(withLogContext('a string', { foo: 'bar' })).toBe('a string');
  });

  it('silently ignores frozen objects', () => {
    const frozen = Object.freeze({ id: 'frozen' });
    expect(() => withLogContext(frozen, { extra: true })).not.toThrow();
    expect(frozen).toEqual({ id: 'frozen' });
  });
});

describe('AppLogError', () => {
  it('carries structured details separate from the message', () => {
    const err = new AppLogError('API error 500', { httpStatus: 500, responseBody: 'oops' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AppLogError');
    expect(err.message).toBe('API error 500');
    expect(err.logDetails).toEqual({ httpStatus: 500, responseBody: 'oops' });
  });
});

describe('createAppLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves with the wrapped function result and logs a success row', async () => {
    const eventType = `test-success-${Date.now()}`;
    const appLog = createAppLogger('ai', 'anthropic');

    const result = await appLog(eventType, { model: 'claude-x' }, async () => ({ text: 'hi' }));

    expect(result).toEqual({ text: 'hi' });
    const rows = await rowsFor('ai', 'anthropic', eventType);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('success');
    expect(JSON.parse(rows[0]!.details as string)).toEqual({ model: 'claude-x' });
    expect(rows[0]!.errorMessage).toBeNull();
    expect(rows[0]!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('handles a primitive (non-object) success result without attempting LOG_EXTRA lookup', async () => {
    const eventType = `test-success-primitive-${Date.now()}`;
    const appLog = createAppLogger('ai', 'local');

    const result = await appLog(eventType, { note: 'primitive' }, async () => 'plain-string-result');

    expect(result).toBe('plain-string-result');
    const rows = await rowsFor('ai', 'local', eventType);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('success');
    expect(JSON.parse(rows[0]!.details as string)).toEqual({ note: 'primitive' });
  });

  it('merges withLogContext extras into the stored details on success', async () => {
    const eventType = `test-success-extra-${Date.now()}`;
    const appLog = createAppLogger('channel', 'whatsapp');

    const result = await appLog(eventType, { to: '+1555' }, async () =>
      withLogContext({ messageId: 'wamid.123' }, { httpStatus: 200, providerMessageId: 'wamid.123' })
    );

    expect(result).toEqual({ messageId: 'wamid.123' });
    const rows = await rowsFor('channel', 'whatsapp', eventType);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.details as string)).toEqual({
      to: '+1555',
      httpStatus: 200,
      providerMessageId: 'wamid.123',
    });
  });

  it('propagates the original error and logs a failed row for plain errors', async () => {
    const eventType = `test-fail-${Date.now()}`;
    const appLog = createAppLogger('pms', 'mews');

    await expect(
      appLog(eventType, { op: 'sync' }, async () => {
        throw new Error('network timeout');
      })
    ).rejects.toThrow('network timeout');

    const rows = await rowsFor('pms', 'mews', eventType);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.errorMessage).toBe('network timeout');
    expect(JSON.parse(rows[0]!.details as string)).toEqual({ op: 'sync' });
  });

  it('merges AppLogError.logDetails into the stored details on failure', async () => {
    const eventType = `test-fail-extra-${Date.now()}`;
    const appLog = createAppLogger('pms', 'cloudbeds');

    await expect(
      appLog(eventType, { op: 'sync' }, async () => {
        throw new AppLogError('API error 503', { httpStatus: 503, responseBody: 'unavailable' });
      })
    ).rejects.toThrow('API error 503');

    const rows = await rowsFor('pms', 'cloudbeds', eventType);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.errorMessage).toBe('API error 503');
    expect(JSON.parse(rows[0]!.details as string)).toEqual({
      op: 'sync',
      httpStatus: 503,
      responseBody: 'unavailable',
    });
  });

  it('stringifies non-Error rejection reasons as the error message', async () => {
    const eventType = `test-fail-nonerror-${Date.now()}`;
    const appLog = createAppLogger('ai', 'ollama');

    await expect(
      appLog(eventType, {}, async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'raw string rejection';
      })
    ).rejects.toBe('raw string rejection');

    const rows = await rowsFor('ai', 'ollama', eventType);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.errorMessage).toBe('raw string rejection');
  });

  it('does not throw and still resolves when the log write itself fails on success path', async () => {
    const eventType = `test-write-fails-success-${Date.now()}`;
    const appLog = createAppLogger('ai', 'anthropic');

    vi.spyOn(db, 'insert').mockImplementationOnce(() => {
      throw new Error('db unavailable');
    });

    const result = await appLog(eventType, {}, async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });

    vi.restoreAllMocks();
    const rows = await rowsFor('ai', 'anthropic', eventType);
    expect(rows).toHaveLength(0); // write failed silently, nothing persisted
  });

  it('still rejects with the original error when the log write itself fails on failure path', async () => {
    const eventType = `test-write-fails-failure-${Date.now()}`;
    const appLog = createAppLogger('ai', 'anthropic');

    vi.spyOn(db, 'insert').mockImplementationOnce(() => {
      throw new Error('db unavailable');
    });

    await expect(
      appLog(eventType, {}, async () => {
        throw new Error('original failure');
      })
    ).rejects.toThrow('original failure');

    vi.restoreAllMocks();
    const rows = await rowsFor('ai', 'anthropic', eventType);
    expect(rows).toHaveLength(0);
  });
});
