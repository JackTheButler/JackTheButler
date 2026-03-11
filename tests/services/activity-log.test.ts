/**
 * Activity Log Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/index.js';
import { activityLog } from '@/db/schema.js';
import { writeActivityLog } from '@/services/activity-log.js';
import { gt } from 'drizzle-orm';

const TEST_CUTOFF = new Date(Date.now() - 1000).toISOString(); // rows written in this test session

describe('writeActivityLog', () => {
  beforeEach(async () => {
    // Remove rows written during these tests only (keep existing seed data intact)
    await db.delete(activityLog).where(gt(activityLog.createdAt, TEST_CUTOFF));
  });

  it('writes a success row with all fields', async () => {
    writeActivityLog(
      'whatsapp',
      'message.sent',
      'success',
      'conv-test-1',
      undefined,
      120,
      { messageId: 'msg-1' }
    );

    const rows = await db.select().from(activityLog).where(gt(activityLog.createdAt, TEST_CUTOFF));
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.source).toBe('whatsapp');
    expect(row.eventType).toBe('message.sent');
    expect(row.status).toBe('success');
    expect(row.conversationId).toBe('conv-test-1');
    expect(row.errorMessage).toBeNull();
    expect(row.latencyMs).toBe(120);
    expect(JSON.parse(row.details!)).toMatchObject({ messageId: 'msg-1' });
    expect(row.id).toBeTruthy();
    expect(row.createdAt).toBeTruthy();
  });

  it('writes a failed row with error message', async () => {
    writeActivityLog(
      'system',
      'processor.outcome',
      'failed',
      undefined,
      'AI provider timeout',
      undefined,
      undefined
    );

    const rows = await db.select().from(activityLog).where(gt(activityLog.createdAt, TEST_CUTOFF));
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.source).toBe('system');
    expect(row.eventType).toBe('processor.outcome');
    expect(row.status).toBe('failed');
    expect(row.conversationId).toBeNull();
    expect(row.errorMessage).toBe('AI provider timeout');
    expect(row.latencyMs).toBeNull();
    expect(row.details).toBeNull();
  });

  it('writes multiple rows independently', async () => {
    writeActivityLog('whatsapp', 'message.received', 'success', 'conv-a', undefined, undefined, undefined);
    writeActivityLog('system', 'scheduler.outcome', 'success', undefined, undefined, 400, { job: 'pms-sync' });

    const rows = await db.select().from(activityLog).where(gt(activityLog.createdAt, TEST_CUTOFF));
    expect(rows).toHaveLength(2);
  });

  it('assigns a unique id per row', async () => {
    writeActivityLog('whatsapp', 'message.sent', 'success', undefined, undefined, undefined, undefined);
    writeActivityLog('whatsapp', 'message.sent', 'success', undefined, undefined, undefined, undefined);

    const rows = await db.select().from(activityLog).where(gt(activityLog.createdAt, TEST_CUTOFF));
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
  });
});
