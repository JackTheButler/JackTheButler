/**
 * Channel Setup Assistant Configuration (Skeleton)
 *
 * Configuration for the channel setup popup assistant.
 * This is a skeleton for future implementation.
 *
 * @module features/channel-setup/config
 */

import type { AssistantConfig } from '@/shared/assistant';
import { assistantRegistry } from '@/shared/assistant';

/**
 * Context for channel setup assistant
 */
export interface ChannelSetupContext {
  /** Channel type being configured */
  channelType?: 'whatsapp' | 'sms' | 'email';

  /** Provider being used */
  provider?: string;

  /** Whether credentials are configured */
  credentialsConfigured: boolean;

  /** Whether webhook is verified */
  webhookVerified: boolean;

  /** Whether test message was sent */
  testMessageSent: boolean;
}

/**
 * Channel setup assistant configuration
 */
export const channelSetupConfig: AssistantConfig<ChannelSetupContext> = {
  id: 'channel-setup',
  name: 'Channel Setup',
  renderMode: 'popup',
  apiBasePath: '/api/v1/apps',

  triggers: {
    pages: ['settings/channels', 'settings/channels/*'],
    keywords: ['setup channel', 'configure whatsapp', 'configure sms', 'configure email'],
  },

  getInitialContext: () => ({
    credentialsConfigured: false,
    webhookVerified: false,
    testMessageSent: false,
  }),

  steps: [
    // Placeholder steps - to be implemented
    {
      id: 'intro',
      progressIndex: 1,
      progressLabel: 'Start',
      isActive: (step) => step === 'intro',
      // Component will be added when implementing
      Component: () => null,
    },
    {
      id: 'credentials',
      progressIndex: 2,
      progressLabel: 'Credentials',
      isActive: (step) => step === 'credentials',
      Component: () => null,
    },
    {
      id: 'webhook',
      progressIndex: 3,
      progressLabel: 'Webhook',
      isActive: (step) => step === 'webhook',
      Component: () => null,
    },
    {
      id: 'test',
      progressIndex: 4,
      progressLabel: 'Test',
      isActive: (step) => step === 'test',
      Component: () => null,
    },
  ],

  totalProgressSteps: 4,
  showSkip: true,

  onComplete: async () => {
    // Refresh channel status
  },
};

/**
 * Register channel setup assistant
 */
export function registerChannelSetupAssistant() {
  assistantRegistry.register(channelSetupConfig);
}

// Note: Don't auto-register - call registerChannelSetupAssistant() when needed
