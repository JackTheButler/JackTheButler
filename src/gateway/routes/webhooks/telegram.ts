/**
 * Telegram Webhook Routes
 *
 * Handles incoming updates from the Telegram Bot API.
 * Configuration is loaded from the app registry (configured via dashboard UI).
 */

import { Hono } from 'hono';
import { createLogger } from '@/utils/logger.js';
import { getAppRegistry } from '@/apps/index.js';
import { appConfigService } from '@/apps/config.js';

const log = createLogger('webhook:telegram');

export const telegramWebhook = new Hono();

/**
 * Get Telegram config from app registry
 */
async function getTelegramConfig(): Promise<{
  botToken?: string;
  webhookSecret?: string;
} | null> {
  const appConfig = await appConfigService.getAppConfig('telegram');
  if (appConfig?.config) {
    return appConfig.config as { botToken?: string; webhookSecret?: string };
  }
  return null;
}

/**
 * Telegram update payload
 */
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    username?: string;
    first_name?: string;
  };
  chat: {
    id: number;
  };
  date: number;
  text?: string;
}

/**
 * POST /webhooks/telegram
 *
 * Receives incoming updates from Telegram.
 * Must respond with 200 quickly to prevent retries.
 */
telegramWebhook.post('/', async (c) => {
  const secretToken = c.req.header('x-telegram-bot-api-secret-token') ?? '';
  const body = await c.req.text();

  // Verify secret token if configured
  const telegramConfig = await getTelegramConfig();
  if (telegramConfig?.webhookSecret) {
    if (secretToken !== telegramConfig.webhookSecret) {
      log.warn('Invalid Telegram webhook secret token');
      return c.text('Invalid secret token', 401);
    }
  }

  // Parse payload
  let update: TelegramUpdate;
  try {
    update = JSON.parse(body);
  } catch {
    log.warn('Invalid JSON payload');
    return c.text('Invalid JSON', 400);
  }

  // Process asynchronously to respond quickly
  processUpdateAsync(update).catch((err) => {
    log.error({ err }, 'Error processing Telegram update');
  });

  return c.text('OK', 200);
});

/**
 * Process a Telegram update asynchronously
 */
async function processUpdateAsync(update: TelegramUpdate): Promise<void> {
  if (!update.message) {
    log.debug({ updateId: update.update_id }, 'Ignoring non-message update');
    return;
  }

  await handleIncomingMessage(update.message);
}

/**
 * Handle an incoming Telegram message
 */
async function handleIncomingMessage(message: TelegramMessage): Promise<void> {
  log.info(
    {
      messageId: message.message_id,
      chatId: message.chat.id,
      from: message.from?.username ?? message.from?.id,
    },
    'Received Telegram message'
  );

  const registry = getAppRegistry();
  const ext = registry.get('telegram');

  if (ext?.status !== 'active' || !ext.instance) {
    log.warn('Telegram not configured. Enable it in Engine > Apps.');
    return;
  }

  const provider = ext.instance as {
    sendText: (chatId: string, text: string) => Promise<unknown>;
  };

  const chatId = String(message.chat.id);

  // Only process text messages
  if (!message.text) {
    await provider.sendText(chatId, "I can only process text messages at the moment. Please send your request as text.");
    return;
  }

  // Process through message processor
  const { processMessage } = await import('@/core/pipeline/index.js');
  const { generateId } = await import('@/utils/id.js');

  const inbound = {
    id: generateId('message'),
    channel: 'telegram' as const,
    channelId: chatId,
    content: message.text,
    contentType: 'text' as const,
    timestamp: new Date(message.date * 1000),
  };

  try {
    const response = await processMessage(inbound);
    await provider.sendText(chatId, response.content);
  } catch (error) {
    log.error({ err: error, messageId: message.message_id }, 'Failed to process Telegram message');
    await provider.sendText(chatId, "I'm sorry, I encountered an error processing your request. Please try again.");
  }
}

export type { TelegramUpdate, TelegramMessage };
