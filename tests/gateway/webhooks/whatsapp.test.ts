/**
 * WhatsApp Webhook — active-provider path tests
 *
 * tests/channels/whatsapp/webhook.test.ts already covers signature
 * verification and webhook subscription challenge/response. That file always
 * mocks the app registry to return no active WhatsApp app, so
 * `handleIncomingMessage` / `handleStatusUpdate` (the bulk of
 * src/gateway/routes/webhooks/whatsapp.ts) are never exercised. This file
 * fills that gap: an active provider, AI pipeline dispatch, media/error
 * fallbacks, batched messages, and delivery-status DB updates.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('@/apps/config.js', () => ({
  appConfigService: {
    getAppConfig: vi.fn(),
  },
}));

const mockRegistryGet = vi.fn();
vi.mock('@/apps/index.js', () => ({
  getAppRegistry: () => ({
    get: mockRegistryGet,
  }),
}));

vi.mock('@/pipeline/index.js', () => ({
  processMessage: vi.fn(),
}));

import { app } from '@/gateway/server.js';
import { appConfigService } from '@/apps/config.js';
import { processMessage } from '@/pipeline/index.js';
import { db, messages, conversations } from '@/db/index.js';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';

const mockGetAppConfig = appConfigService.getAppConfig as ReturnType<typeof vi.fn>;
const mockProcessMessage = processMessage as ReturnType<typeof vi.fn>;

function postWebhook(payload: unknown) {
  return app.request('/webhooks/whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function makePayload(messagesArr?: unknown[], statuses?: unknown[]) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15551234567', phone_number_id: 'phone-id-123' },
              contacts: [{ profile: { name: 'Test User' }, wa_id: '15559876543' }],
              ...(messagesArr ? { messages: messagesArr } : {}),
              ...(statuses ? { statuses } : {}),
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}

describe('WhatsApp Webhook — active provider processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAppConfig.mockResolvedValue({ config: { accessToken: 'token' } }); // no appSecret -> sig check skipped
  });

  it('does nothing when no WhatsApp app is active in the registry', async () => {
    mockRegistryGet.mockReturnValue(undefined);

    const res = await postWebhook(makePayload([{ from: '15559876543', id: 'wamid.1', timestamp: '1', type: 'text', text: { body: 'hi' } }]));

    expect(res.status).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockProcessMessage).not.toHaveBeenCalled();
  });

  it('marks the message read and sends a text-only fallback for non-text messages', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const markAsRead = vi.fn().mockResolvedValue(undefined);
    mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendText, markAsRead } });

    const res = await postWebhook(
      makePayload([{ from: '15559876543', id: 'wamid.2', timestamp: '1', type: 'image', image: { id: 'img1', mime_type: 'image/png', sha256: 'x' } }])
    );

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(markAsRead).toHaveBeenCalledWith('wamid.2'));
    await vi.waitFor(() => expect(sendText).toHaveBeenCalledWith('+15559876543', expect.stringContaining('only process text messages')));
    expect(mockProcessMessage).not.toHaveBeenCalled();
  });

  it('adds a + prefix to numbers that lack it and processes text messages through the pipeline', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const markAsRead = vi.fn().mockResolvedValue(undefined);
    mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendText, markAsRead } });
    mockProcessMessage.mockResolvedValue({ content: 'Checkout is at 11am.' });

    const res = await postWebhook(
      makePayload([{ from: '15559876543', id: 'wamid.3', timestamp: '1', type: 'text', text: { body: 'What time is checkout?' } }])
    );

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(sendText).toHaveBeenCalledWith('+15559876543', 'Checkout is at 11am.'));
    expect(mockProcessMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'whatsapp', channelId: '+15559876543', content: 'What time is checkout?' })
    );
  });

  it('sends a generic error fallback when the pipeline throws', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const markAsRead = vi.fn().mockResolvedValue(undefined);
    mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendText, markAsRead } });
    mockProcessMessage.mockRejectedValue(new Error('pipeline exploded'));

    const res = await postWebhook(
      makePayload([{ from: '15559876543', id: 'wamid.4', timestamp: '1', type: 'text', text: { body: 'hi' } }])
    );

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(sendText).toHaveBeenCalledWith('+15559876543', expect.stringContaining('encountered an error')));
  });

  it('processes every message in a batched payload, not just the first (multiple messages in one change)', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const markAsRead = vi.fn().mockResolvedValue(undefined);
    mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendText, markAsRead } });
    mockProcessMessage.mockResolvedValue({ content: 'ack' });

    const res = await postWebhook(
      makePayload([
        { from: '15551111111', id: 'wamid.a', timestamp: '1', type: 'text', text: { body: 'first' } },
        { from: '15552222222', id: 'wamid.b', timestamp: '2', type: 'text', text: { body: 'second' } },
        { from: '15553333333', id: 'wamid.c', timestamp: '3', type: 'text', text: { body: 'third' } },
      ])
    );

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(markAsRead).toHaveBeenCalledTimes(3));
    expect(markAsRead).toHaveBeenCalledWith('wamid.a');
    expect(markAsRead).toHaveBeenCalledWith('wamid.b');
    expect(markAsRead).toHaveBeenCalledWith('wamid.c');
    expect(mockProcessMessage).toHaveBeenCalledTimes(3);
  });

  it('ignores non-"messages" webhook fields and non-WhatsApp payloads without error', async () => {
    const res1 = await postWebhook({ object: 'page', entry: [] });
    expect(res1.status).toBe(200);

    const res2 = await postWebhook({
      object: 'whatsapp_business_account',
      entry: [{ id: '1', changes: [{ value: { messaging_product: 'whatsapp', metadata: { display_phone_number: 'x', phone_number_id: 'y' } }, field: 'other_field' }] }],
    });
    expect(res2.status).toBe(200);
  });

  describe('status updates', () => {
    it('updates the matching message delivery status to "read"', async () => {
      const conversationId = generateId('conversation');
      const messageId = generateId('message');
      await db.insert(conversations).values({
        id: conversationId,
        channelType: 'whatsapp',
        channelId: '+15559876543',
        state: 'active',
        metadata: '{}',
      });
      await db.insert(messages).values({
        id: messageId,
        conversationId,
        direction: 'outbound',
        senderType: 'ai',
        content: 'Checkout is at 11am.',
        contentType: 'text',
        channelMessageId: 'wamid.status.1',
        deliveryStatus: 'delivered',
        createdAt: now(),
      });

      const res = await postWebhook(
        makePayload(undefined, [{ id: 'wamid.status.1', status: 'read', timestamp: '1', recipient_id: '15559876543' }])
      );

      expect(res.status).toBe(200);
      await vi.waitFor(async () => {
        const row = await db.select().from(messages).where(eq(messages.id, messageId)).get();
        expect(row?.deliveryStatus).toBe('read');
      });
    });

    it('records the error message for a failed status update', async () => {
      const conversationId = generateId('conversation');
      const messageId = generateId('message');
      await db.insert(conversations).values({
        id: conversationId,
        channelType: 'whatsapp',
        channelId: '+15559876543',
        state: 'active',
        metadata: '{}',
      });
      await db.insert(messages).values({
        id: messageId,
        conversationId,
        direction: 'outbound',
        senderType: 'ai',
        content: 'Checkout is at 11am.',
        contentType: 'text',
        channelMessageId: 'wamid.status.2',
        deliveryStatus: 'sent',
        createdAt: now(),
      });

      const res = await postWebhook(
        makePayload(undefined, [
          {
            id: 'wamid.status.2',
            status: 'failed',
            timestamp: '1',
            recipient_id: '15559876543',
            errors: [{ code: 131_047, title: 'Re-engagement message', message: '24 hour window expired' }],
          },
        ])
      );

      expect(res.status).toBe(200);
      await vi.waitFor(async () => {
        const row = await db.select().from(messages).where(eq(messages.id, messageId)).get();
        expect(row?.deliveryStatus).toBe('failed');
        expect(row?.deliveryError).toBe('24 hour window expired');
      });
    });

    it('does not throw when a status update references an unknown message id', async () => {
      const res = await postWebhook(
        makePayload(undefined, [{ id: 'wamid.unknown', status: 'sent', timestamp: '1', recipient_id: '15559876543' }])
      );

      expect(res.status).toBe(200);
    });
  });
});
