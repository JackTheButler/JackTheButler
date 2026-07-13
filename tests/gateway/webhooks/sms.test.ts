/**
 * SMS (Twilio) Webhook Tests
 *
 * Covers src/gateway/routes/webhooks/sms.ts:
 * - POST /webhooks/sms — inbound message webhook (signature verification,
 *   media fallback, AI pipeline dispatch, error fallback)
 * - POST /webhooks/sms/status — delivery status callback (signature
 *   verification, DB status mapping)
 *
 * Pattern follows tests/channels/whatsapp/webhook.test.ts: mock the app
 * config service and app registry, hit the real Hono app via app.request().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
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

/**
 * Compute a valid Twilio signature exactly as sms.ts does: HMAC-SHA1 over
 * `url + sortedKey1 + value1 + sortedKey2 + value2 + ...`, base64-encoded.
 */
function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  return createHmac('sha1', authToken).update(data).digest('base64');
}

const SMS_URL = 'http://localhost/webhooks/sms';

function postSms(params: Record<string, string>, headers: Record<string, string> = {}) {
  return app.request('/webhooks/sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: new URLSearchParams(params).toString(),
  });
}

function postStatus(params: Record<string, string>, headers: Record<string, string> = {}) {
  return app.request('/webhooks/sms/status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: new URLSearchParams(params).toString(),
  });
}

const basePayload = {
  MessageSid: 'SM_test_1',
  AccountSid: 'AC_test',
  From: '+15559876543',
  To: '+15551234567',
  Body: 'What time is checkout?',
  NumMedia: '0',
  NumSegments: '1',
};

describe('SMS (Twilio) Webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistryGet.mockReturnValue(undefined);
  });

  describe('POST /webhooks/sms (incoming message)', () => {
    it('rejects when signature header is missing entirely and an auth token is configured', async () => {
      // Security: absent credential must be rejected, not treated as "skip check".
      mockGetAppConfig.mockResolvedValue({ config: { authToken: 'super-secret-token' } });

      const res = await postSms(basePayload); // no x-twilio-signature header at all

      expect(res.status).toBe(401);
      expect(await res.text()).toBe('Invalid signature');
    });

    it('rejects when signature header is present but incorrect', async () => {
      mockGetAppConfig.mockResolvedValue({ config: { authToken: 'super-secret-token' } });

      const res = await postSms(basePayload, { 'x-twilio-signature': 'totally-bogus-signature' });

      expect(res.status).toBe(401);
      expect(await res.text()).toBe('Invalid signature');
    });

    it('accepts a request with a correctly computed signature', async () => {
      const authToken = 'super-secret-token';
      mockGetAppConfig.mockResolvedValue({ config: { authToken } });
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendMessage } });
      mockProcessMessage.mockResolvedValue({ content: 'Checkout is at 11am.' });

      const signature = twilioSignature(SMS_URL, basePayload, authToken);
      const res = await postSms(basePayload, { 'x-twilio-signature': signature });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/xml');
      expect(await res.text()).toContain('<Response></Response>');
    });

    it('CHARACTERIZATION: skips signature verification entirely when no auth token is configured (dev-mode bypass)', async () => {
      // Documents current behavior: with no configured Twilio auth token, ANY
      // request is accepted regardless of signature (mirrors the same
      // dev-mode bypass in whatsapp.ts / pms.ts). This is an intentional
      // "allow in development" fallback per the source comment, not a new bug,
      // but it does mean an unconfigured deployment accepts unsigned webhooks.
      mockGetAppConfig.mockResolvedValue(null);

      const res = await postSms(basePayload); // no signature header, no config at all

      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<Response></Response>');
    });

    it('sends a text-only fallback and skips the AI pipeline when the message contains media', async () => {
      mockGetAppConfig.mockResolvedValue(null);
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendMessage } });

      const res = await postSms({ ...basePayload, NumMedia: '1', MediaUrl0: 'https://example.com/img.png' });

      expect(res.status).toBe(200);
      await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
      expect(sendMessage).toHaveBeenCalledWith(
        basePayload.From,
        expect.stringContaining('only process text messages')
      );
      expect(mockProcessMessage).not.toHaveBeenCalled();
    });

    it('processes a text message through the pipeline and replies with the AI response', async () => {
      mockGetAppConfig.mockResolvedValue(null);
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendMessage } });
      mockProcessMessage.mockResolvedValue({ content: 'Checkout is at 11am.' });

      const res = await postSms(basePayload);

      expect(res.status).toBe(200);
      await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(basePayload.From, 'Checkout is at 11am.'));
      expect(mockProcessMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'sms',
          channelId: basePayload.From,
          content: basePayload.Body,
          contentType: 'text',
        })
      );
    });

    it('sends a generic error fallback when the pipeline throws', async () => {
      mockGetAppConfig.mockResolvedValue(null);
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendMessage } });
      mockProcessMessage.mockRejectedValue(new Error('pipeline exploded'));

      const res = await postSms(basePayload);

      expect(res.status).toBe(200); // still acknowledges Twilio immediately
      await vi.waitFor(() =>
        expect(sendMessage).toHaveBeenCalledWith(basePayload.From, expect.stringContaining('encountered an error'))
      );
    });

    it('does not process the message when the SMS app is not active in the registry', async () => {
      mockGetAppConfig.mockResolvedValue(null);
      mockRegistryGet.mockReturnValue(undefined);

      const res = await postSms(basePayload);

      expect(res.status).toBe(200);
      // Give the fire-and-forget async handler a chance to run; it should
      // return early (warn + no-op) without ever calling the pipeline.
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockProcessMessage).not.toHaveBeenCalled();
    });
  });

  describe('POST /webhooks/sms/status (delivery status callback)', () => {
    const statusPayload = {
      MessageSid: 'SM_status_1',
      MessageStatus: 'delivered',
    };

    it('rejects when signature header is missing entirely and an auth token is configured', async () => {
      mockGetAppConfig.mockResolvedValue({ config: { authToken: 'super-secret-token' } });

      const res = await postStatus(statusPayload);

      expect(res.status).toBe(401);
      expect(await res.text()).toBe('Invalid signature');
    });

    it('rejects when signature header is present but incorrect', async () => {
      mockGetAppConfig.mockResolvedValue({ config: { authToken: 'super-secret-token' } });

      const res = await postStatus(statusPayload, { 'x-twilio-signature': 'nope' });

      expect(res.status).toBe(401);
    });

    it('updates the matching message delivery status to "delivered"', async () => {
      mockGetAppConfig.mockResolvedValue(null);

      const conversationId = generateId('conversation');
      const messageId = generateId('message');
      await db.insert(conversations).values({
        id: conversationId,
        channelType: 'sms',
        channelId: basePayload.From,
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
        channelMessageId: 'SM_delivered_1',
        deliveryStatus: 'sent',
        createdAt: now(),
      });

      const res = await postStatus({ MessageSid: 'SM_delivered_1', MessageStatus: 'delivered' });

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('OK');

      const row = await db.select().from(messages).where(eq(messages.id, messageId)).get();
      expect(row?.deliveryStatus).toBe('delivered');
    });

    it('maps a "failed" MessageStatus to "failed" and records the error message', async () => {
      mockGetAppConfig.mockResolvedValue(null);

      const conversationId = generateId('conversation');
      const messageId = generateId('message');
      await db.insert(conversations).values({
        id: conversationId,
        channelType: 'sms',
        channelId: basePayload.From,
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
        channelMessageId: 'SM_failed_1',
        deliveryStatus: 'pending',
        createdAt: now(),
      });

      const res = await postStatus({
        MessageSid: 'SM_failed_1',
        MessageStatus: 'failed',
        ErrorCode: '30003',
        ErrorMessage: 'Unreachable destination handset',
      });

      expect(res.status).toBe(200);

      const row = await db.select().from(messages).where(eq(messages.id, messageId)).get();
      expect(row?.deliveryStatus).toBe('failed');
      expect(row?.deliveryError).toBe('Unreachable destination handset');
    });

    it('does not throw when the MessageSid does not match any stored message', async () => {
      mockGetAppConfig.mockResolvedValue(null);

      const res = await postStatus({ MessageSid: 'sid-with-no-matching-row', MessageStatus: 'sent' });

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('OK');
    });
  });
});
