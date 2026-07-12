/**
 * Telegram Webhook Tests
 *
 * Covers src/gateway/routes/webhooks/telegram.ts:
 * - Secret-token verification (missing/wrong/correct/unconfigured)
 * - Malformed JSON handling
 * - Update processing (/start, non-message updates, non-text messages,
 *   successful AI pipeline dispatch, pipeline error fallback, inactive app)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

vi.mock('@/core/pipeline/index.js', () => ({
  processMessage: vi.fn(),
}));

import { app } from '@/gateway/server.js';
import { appConfigService } from '@/apps/config.js';
import { processMessage } from '@/core/pipeline/index.js';

const mockGetAppConfig = appConfigService.getAppConfig as ReturnType<typeof vi.fn>;
const mockProcessMessage = processMessage as ReturnType<typeof vi.fn>;

function postTelegram(body: unknown, headers: Record<string, string> = {}) {
  return app.request('/webhooks/telegram', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const textUpdate = {
  update_id: 1001,
  message: {
    message_id: 42,
    from: { id: 555, username: 'guest_555', first_name: 'Guest' },
    chat: { id: 555 },
    date: 1_700_000_000,
    text: 'What time is checkout?',
  },
};

describe('Telegram Webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistryGet.mockReturnValue(undefined);
  });

  describe('POST /webhooks/telegram — secret token verification', () => {
    it('rejects when the secret token header is missing entirely and a secret is configured', async () => {
      // Security: absent credential must be rejected, not treated as "skip check".
      mockGetAppConfig.mockResolvedValue({ config: { webhookSecret: 'super-secret' } });

      const res = await postTelegram(textUpdate); // no x-telegram-bot-api-secret-token header

      expect(res.status).toBe(401);
      expect(await res.text()).toBe('Invalid secret token');
    });

    it('rejects when the secret token header is present but wrong', async () => {
      mockGetAppConfig.mockResolvedValue({ config: { webhookSecret: 'super-secret' } });

      const res = await postTelegram(textUpdate, { 'x-telegram-bot-api-secret-token': 'wrong-token' });

      expect(res.status).toBe(401);
    });

    it('accepts when the secret token header matches', async () => {
      mockGetAppConfig.mockResolvedValue({ config: { webhookSecret: 'super-secret' } });
      mockRegistryGet.mockReturnValue(undefined); // not active, so processing short-circuits after auth passes

      const res = await postTelegram(textUpdate, { 'x-telegram-bot-api-secret-token': 'super-secret' });

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('OK');
    });

    it('CHARACTERIZATION: skips secret-token verification entirely when no secret is configured (dev-mode bypass)', async () => {
      // Documents current behavior, mirrors the same bypass in sms.ts / whatsapp.ts.
      mockGetAppConfig.mockResolvedValue(null);

      const res = await postTelegram(textUpdate); // no header at all, no config

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('OK');
    });
  });

  describe('POST /webhooks/telegram — payload validation', () => {
    it('returns 400 for invalid JSON', async () => {
      mockGetAppConfig.mockResolvedValue(null);

      const res = await postTelegram('{not valid json');

      expect(res.status).toBe(400);
      expect(await res.text()).toBe('Invalid JSON');
    });
  });

  describe('POST /webhooks/telegram — update processing', () => {
    it('ignores non-message updates without calling the pipeline', async () => {
      mockGetAppConfig.mockResolvedValue(null);
      mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendText: vi.fn() } });

      const res = await postTelegram({ update_id: 2, edited_message: { text: 'edited' } });

      expect(res.status).toBe(200);
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockProcessMessage).not.toHaveBeenCalled();
    });

    it('ignores /start command messages without calling the pipeline', async () => {
      mockGetAppConfig.mockResolvedValue(null);
      const sendText = vi.fn().mockResolvedValue(undefined);
      mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendText } });

      const res = await postTelegram({
        update_id: 3,
        message: {
          message_id: 1,
          chat: { id: 999 },
          date: 1_700_000_100,
          text: '/start',
        },
      });

      expect(res.status).toBe(200);
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockProcessMessage).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
    });

    it('does not process the message when Telegram is not active in the registry', async () => {
      mockGetAppConfig.mockResolvedValue(null);
      mockRegistryGet.mockReturnValue(undefined);

      const res = await postTelegram(textUpdate);

      expect(res.status).toBe(200);
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockProcessMessage).not.toHaveBeenCalled();
    });

    it('sends a text-only fallback for non-text messages', async () => {
      mockGetAppConfig.mockResolvedValue(null);
      const sendText = vi.fn().mockResolvedValue(undefined);
      mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendText } });

      const res = await postTelegram({
        update_id: 4,
        message: {
          message_id: 2,
          chat: { id: 777 },
          date: 1_700_000_200,
          // no `text` field — e.g. a photo/sticker update
        },
      });

      expect(res.status).toBe(200);
      await vi.waitFor(() => expect(sendText).toHaveBeenCalled());
      expect(sendText).toHaveBeenCalledWith('777', expect.stringContaining('only process text messages'));
      expect(mockProcessMessage).not.toHaveBeenCalled();
    });

    it('processes a text message through the pipeline and replies with the AI response', async () => {
      mockGetAppConfig.mockResolvedValue(null);
      const sendText = vi.fn().mockResolvedValue(undefined);
      mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendText } });
      mockProcessMessage.mockResolvedValue({ content: 'Checkout is at 11am.' });

      const res = await postTelegram(textUpdate);

      expect(res.status).toBe(200);
      await vi.waitFor(() => expect(sendText).toHaveBeenCalledWith('555', 'Checkout is at 11am.'));
      expect(mockProcessMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'telegram',
          channelId: '555',
          content: 'What time is checkout?',
          contentType: 'text',
          timestamp: new Date(textUpdate.message.date * 1000),
        })
      );
    });

    it('sends a generic error fallback when the pipeline throws', async () => {
      mockGetAppConfig.mockResolvedValue(null);
      const sendText = vi.fn().mockResolvedValue(undefined);
      mockRegistryGet.mockReturnValue({ status: 'active', instance: { sendText } });
      mockProcessMessage.mockRejectedValue(new Error('pipeline exploded'));

      const res = await postTelegram(textUpdate);

      expect(res.status).toBe(200); // still acknowledges Telegram immediately
      await vi.waitFor(() =>
        expect(sendText).toHaveBeenCalledWith('555', expect.stringContaining('encountered an error'))
      );
    });
  });
});
