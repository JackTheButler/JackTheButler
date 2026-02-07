/**
 * Help Assistant Configuration (Skeleton)
 *
 * Configuration for the floating help assistant.
 * This is a skeleton for future implementation.
 *
 * @module features/help/config
 */

import type { AssistantConfig } from '@/shared/assistant';
import { assistantRegistry } from '@/shared/assistant';

/**
 * Context for help assistant
 */
export interface HelpContext {
  /** Current page path */
  currentPage?: string;

  /** Chat history */
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;

  /** Whether AI is processing */
  isProcessing: boolean;
}

/**
 * Help assistant configuration
 */
export const helpAssistantConfig: AssistantConfig<HelpContext> = {
  id: 'help',
  name: 'Ask Jack',
  renderMode: 'floating',

  triggers: {
    pages: ['*'], // Available on all pages
    keywords: ['help', 'how do i', 'what is', 'ask jack'],
  },

  getInitialContext: () => ({
    chatHistory: [],
    isProcessing: false,
  }),

  steps: [
    // Single step for free-form chat
    {
      id: 'chat',
      progressIndex: 1,
      isActive: () => true,
      // Component will be added when implementing
      Component: () => null,
    },
  ],

  // No progress bar for chat interface
  totalProgressSteps: 0,
  showSkip: false,
};

/**
 * Register help assistant
 */
export function registerHelpAssistant() {
  assistantRegistry.register(helpAssistantConfig);
}

// Note: Don't auto-register - call registerHelpAssistant() when needed
