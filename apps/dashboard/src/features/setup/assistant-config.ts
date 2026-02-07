/**
 * Setup Assistant Configuration
 *
 * Configuration for the setup wizard using the shared assistant system.
 *
 * @module features/setup/assistant-config
 */

import { assistantRegistry, type AssistantConfig } from '@/shared/assistant';
import type { SetupStepContext } from './steps/types';
import { skipSetup } from './api';

/**
 * Initial context for setup wizard
 */
export function getInitialSetupContext(): SetupStepContext {
  return {
    chatStep: 'greeting',
    propertyName: undefined,
    propertyType: undefined,
    aiProvider: undefined,
    aiConfigured: false,
    adminCreated: false,
    selectedAIProvider: null,
    scrapedEntries: [],
    checklist: null,
    currentQuestion: '',
    typingStatus: '',
  };
}

/**
 * Setup assistant configuration
 */
export const setupAssistantConfig: AssistantConfig<SetupStepContext> = {
  id: 'setup',
  name: 'Setup Wizard',
  renderMode: 'fullscreen',
  apiBasePath: '/api/v1/setup',
  totalProgressSteps: 5,
  showSkip: true,

  getInitialContext: getInitialSetupContext,

  steps: [
    {
      id: 'bootstrap',
      progressIndex: 0,
      progressLabel: 'Start',
      isActive: (step) => step === 'bootstrap',
      Component: () => null, // Handled separately
    },
    {
      id: 'property',
      progressIndex: 1,
      progressLabel: 'Property',
      isActive: (step, ctx) =>
        step === 'property' ||
        ctx.chatStep === 'ask_name' ||
        ctx.chatStep === 'ask_type',
      Component: () => null,
      resumeMessage: (ctx) =>
        ctx.propertyName
          ? `Welcome back! Let's continue setting up ${ctx.propertyName}.`
          : '',
    },
    {
      id: 'ai-provider',
      progressIndex: 2,
      progressLabel: 'AI',
      isActive: (step, ctx) =>
        step === 'ai-provider' ||
        ctx.chatStep === 'ask_ai_provider' ||
        ctx.chatStep === 'ask_api_key',
      Component: () => null,
    },
    {
      id: 'knowledge',
      progressIndex: 3,
      progressLabel: 'Knowledge',
      isActive: (step, ctx) =>
        step === 'knowledge' ||
        ctx.chatStep === 'ask_website' ||
        ctx.chatStep === 'scraping' ||
        ctx.chatStep === 'show_checklist' ||
        ctx.chatStep.startsWith('ask_manual_'),
      Component: () => null,
    },
    {
      id: 'admin',
      progressIndex: 4,
      progressLabel: 'Account',
      isActive: (step, ctx) =>
        step === 'admin' ||
        ctx.chatStep === 'ask_admin',
      Component: () => null,
    },
  ],

  onComplete: async () => {
    window.location.href = '/login';
  },

  onSkip: async () => {
    await skipSetup();
    window.location.href = '/login';
  },
};

/**
 * Register the setup assistant
 */
export function registerSetupAssistant(): void {
  assistantRegistry.register(setupAssistantConfig);
}

// Auto-register on import
registerSetupAssistant();
