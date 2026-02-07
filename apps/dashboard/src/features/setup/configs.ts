/**
 * Setup Step Configurations
 *
 * Static configurations for setup wizard steps including
 * choice options and form configurations.
 *
 * @module features/setup/configs
 */

import { Building2, Home, Key, HelpCircle, Sparkles, Zap, Cpu, type LucideIcon } from 'lucide-react';
import type { ChatStep, AIProvider } from './types';

/**
 * Choice option for buttons
 */
export interface Choice {
  id: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * Card choice with description
 */
export interface CardChoice {
  id: string;
  label: string;
  description: string;
  icon?: LucideIcon;
  recommended?: boolean;
}

/**
 * Get property type choices with translations
 */
export function getPropertyTypeChoices(t: (key: string) => string): Choice[] {
  return [
    { id: 'hotel', label: t('propertyTypes.hotel'), icon: Building2 },
    { id: 'bnb', label: t('propertyTypes.bnb'), icon: Home },
    { id: 'vacation_rental', label: t('propertyTypes.vacation_rental'), icon: Key },
    { id: 'other', label: t('propertyTypes.other'), icon: HelpCircle },
  ];
}

/**
 * Get AI provider choices with translations
 */
export function getAIProviderChoices(t: (key: string) => string): CardChoice[] {
  return [
    {
      id: 'anthropic',
      label: t('aiProvider.anthropic.title'),
      description: t('aiProvider.anthropic.description'),
      icon: Sparkles,
      recommended: true,
    },
    {
      id: 'openai',
      label: t('aiProvider.openai.title'),
      description: t('aiProvider.openai.description'),
      icon: Zap,
    },
    {
      id: 'local',
      label: t('aiProvider.local.title'),
      description: t('aiProvider.local.description'),
      icon: Cpu,
    },
  ];
}

/**
 * Form field configuration
 */
export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'url';
  placeholder: string;
  required?: boolean;
}

/**
 * Form card configuration
 */
export interface FormCardConfig {
  title: string;
  description: string;
  fields: FormField[];
  submitLabel: string;
  skipLabel?: string;
  helpLabel?: string;
}

/**
 * Get API key form config
 */
export function getApiKeyFormConfig(
  selectedProvider: AIProvider | null,
  t: (key: string, vars?: Record<string, string>) => string
): FormCardConfig | undefined {
  if (!selectedProvider || selectedProvider === 'local') return undefined;

  const providerName = selectedProvider === 'anthropic' ? 'Anthropic Claude' : 'OpenAI';
  return {
    title: t('aiProvider.apiKeyTitle', { provider: providerName }),
    description: t('aiProvider.apiKeyDescription', { provider: providerName }),
    fields: [
      {
        key: 'apiKey',
        label: t('aiProvider.apiKeyLabel'),
        type: 'password' as const,
        placeholder: selectedProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...',
        required: true,
      },
    ],
    submitLabel: t('aiProvider.continue'),
    skipLabel: t('aiProvider.useLocal'),
    helpLabel: t('aiProvider.getKey'),
  };
}

/**
 * Get admin form config
 */
export function getAdminFormConfig(t: (key: string) => string): FormCardConfig {
  return {
    title: t('admin.title'),
    description: t('admin.description'),
    fields: [
      {
        key: 'name',
        label: t('admin.nameLabel'),
        type: 'text' as const,
        placeholder: t('admin.namePlaceholder'),
        required: true,
      },
      {
        key: 'email',
        label: t('admin.emailLabel'),
        type: 'email' as const,
        placeholder: t('admin.emailPlaceholder'),
        required: true,
      },
      {
        key: 'password',
        label: t('admin.passwordLabel'),
        type: 'password' as const,
        placeholder: t('admin.passwordPlaceholder'),
        required: true,
      },
      {
        key: 'confirmPassword',
        label: t('admin.confirmLabel'),
        type: 'password' as const,
        placeholder: t('admin.confirmPlaceholder'),
        required: true,
      },
    ],
    submitLabel: t('admin.submit'),
  };
}

/**
 * Input mode for chat interface
 */
export type InputMode = 'text' | 'choices' | 'cards' | 'form' | 'checklist' | 'none';

/**
 * Get input mode for a chat step
 */
export function getInputMode(chatStep: ChatStep): InputMode {
  if (chatStep === 'ask_name') return 'text';
  if (chatStep === 'ask_type') return 'choices';
  if (chatStep === 'ask_ai_provider') return 'cards';
  if (chatStep === 'ask_api_key') return 'form';
  if (chatStep === 'ask_website') return 'text';
  if (chatStep === 'show_checklist') return 'checklist';
  if (chatStep.startsWith('ask_manual_')) return 'text';
  if (chatStep === 'ask_admin') return 'form';
  return 'none';
}
