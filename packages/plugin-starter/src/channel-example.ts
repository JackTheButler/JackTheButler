/**
 * Jack The Butler — Channel Plugin Example
 *
 * Copy this file as your starting point for a new channel plugin.
 *
 * Steps:
 * 1. Copy packages/plugin-starter to packages/channel-yourprovider/
 * 2. Update package.json name to @jack-plugins/channel-yourprovider
 * 3. Replace StarterChannelAdapter with your real implementation
 * 4. Update the manifest: id, name, description, configSchema, features
 * 5. Add to root package.json as `"@jack-plugins/channel-yourprovider": "workspace:*"` and run: pnpm install && pnpm typecheck
 */

import type {
  ChannelAppManifest,
  AppLogger,
  BaseProvider,
  ConnectionTestResult,
  InboundMessage,
  OutboundMessage,
  PluginContext,
  SendResult,
} from '@jack/shared';
import { withLogContext } from '@jack/shared';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface StarterChannelConfig {
  apiKey: string;
  phoneNumber?: string;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Channel adapters implement BaseProvider and satisfy the ChannelAdapter
 * interface structurally (send + parseIncoming methods).
 *
 * Note: testConnection() returns ConnectionTestResult (not boolean).
 * This is different from PMS plugins which return Promise<boolean>.
 */
export class StarterChannelAdapter implements BaseProvider {
  readonly id = 'channel-starter';
  readonly appLog: AppLogger;
  readonly channel = 'sms' as const; // change to 'whatsapp', 'email', etc.
  private apiKey: string;
  private phoneNumber: string;

  constructor(config: StarterChannelConfig, context: PluginContext) {
    this.appLog = context.appLog;
    if (!config.apiKey) throw new Error('StarterChannel requires an API key');
    this.apiKey = config.apiKey;
    this.phoneNumber = config.phoneNumber ?? '';
  }

  // ── BaseProvider ────────────────────────────────────────────────────────────

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      await this.appLog('connection_test', {}, async () => {
        // Replace with a real lightweight call to verify credentials
        await fetch('https://api.example.com/account', {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
      });
      return {
        success: true,
        message: 'Connected to Starter Channel',
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // ── ChannelAdapter ──────────────────────────────────────────────────────────

  /**
   * Send an outbound message to a guest.
   * message.channelId is the guest's phone number / contact ID.
   * message.content is the text to send.
   */
  async send(message: OutboundMessage): Promise<SendResult> {
    return this.appLog('send_message', { to: message.channelId }, async () => {
      const response = await fetch('https://api.example.com/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.phoneNumber,
          to: message.channelId,
          body: message.content,
        }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return withLogContext({ status: 'sent' as const }, { to: message.channelId });
    });
  }

  /**
   * Parse an inbound webhook payload into a normalized InboundMessage.
   * Called by your webhook route handler before passing to the message processor.
   *
   * Example webhook route:
   *   const adapter = registry.getChannelAdapter('channel-starter');
   *   const message = await adapter.parseIncoming(req.body);
   *   await messageProcessor.process(message);
   */
  async parseIncoming(raw: unknown): Promise<InboundMessage> {
    const data = raw as { from: string; body: string; messageSid?: string };
    return {
      id: data.messageSid ?? crypto.randomUUID(),
      channel: this.channel,
      channelId: data.from,
      content: data.body,
      contentType: 'text',
      timestamp: new Date(),
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createStarterChannelAdapter(config: StarterChannelConfig, context: PluginContext): StarterChannelAdapter {
  return new StarterChannelAdapter(config, context);
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

export const manifest: ChannelAppManifest = {
  id: 'channel-starter',
  name: 'Starter Channel',
  category: 'channel',
  version: '1.0.0',
  description: 'Example channel plugin — replace with your real integration',
  icon: '💬',
  docsUrl: 'https://docs.example.com/api',
  configSchema: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      description: 'Your messaging provider API key',
    },
    {
      key: 'phoneNumber',
      label: 'Phone Number',
      type: 'text',
      required: false,
      placeholder: '+15551234567',
      description: 'Your outbound phone number (E.164 format)',
    },
  ],
  features: {
    inbound: true,
    outbound: true,
    media: false,
  },
  createAdapter: (config, context) => createStarterChannelAdapter(config as unknown as StarterChannelConfig, context),
};

export default { manifest };
