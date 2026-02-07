/**
 * Setup Form Schemas
 *
 * Declarative form schemas for setup wizard steps.
 *
 * @module features/setup/schemas
 */

import type { FormSchema } from '@/shared/forms';
import type { AIProvider } from './types';

/**
 * Get API key form schema
 */
export function getApiKeyFormSchema(
  selectedProvider: AIProvider | null,
  t: (key: string, vars?: Record<string, string>) => string
): FormSchema | undefined {
  if (!selectedProvider || selectedProvider === 'local') return undefined;

  const providerName = selectedProvider === 'anthropic' ? 'Anthropic Claude' : 'OpenAI';

  return {
    id: 'api-key-form',
    title: t('aiProvider.apiKeyTitle', { provider: providerName }),
    description: t('aiProvider.apiKeyDescription', { provider: providerName }),
    fields: [
      {
        key: 'apiKey',
        type: 'password',
        label: t('aiProvider.apiKeyLabel'),
        placeholder: selectedProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...',
        required: true,
        autoComplete: 'off',
        validation: {
          minLength: 10,
          message: 'API key appears to be too short',
        },
      },
    ],
    submitLabel: t('aiProvider.continue'),
    skipLabel: t('aiProvider.useLocal'),
    helpLabel: t('aiProvider.getKey'),
  };
}

/**
 * Get admin account form schema
 */
export function getAdminFormSchema(
  t: (key: string) => string
): FormSchema {
  return {
    id: 'admin-form',
    title: t('admin.title'),
    description: t('admin.description'),
    fields: [
      {
        key: 'name',
        type: 'text',
        label: t('admin.nameLabel'),
        placeholder: t('admin.namePlaceholder'),
        required: true,
        autoComplete: 'name',
        validation: {
          minLength: 2,
        },
      },
      {
        key: 'email',
        type: 'email',
        label: t('admin.emailLabel'),
        placeholder: t('admin.emailPlaceholder'),
        required: true,
        autoComplete: 'email',
      },
      {
        key: 'password',
        type: 'password',
        label: t('admin.passwordLabel'),
        placeholder: t('admin.passwordPlaceholder'),
        required: true,
        autoComplete: 'new-password',
        validation: {
          minLength: 8,
        },
        help: 'At least 8 characters',
      },
      {
        key: 'confirmPassword',
        type: 'password',
        label: t('admin.confirmLabel'),
        placeholder: t('admin.confirmPlaceholder'),
        required: true,
        autoComplete: 'new-password',
        validation: {
          custom: (value, allValues) => {
            if (value !== allValues.password) {
              return 'Passwords do not match';
            }
            return null;
          },
        },
      },
    ],
    submitLabel: t('admin.submit'),
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (values.password !== values.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }
      return errors;
    },
  };
}

/**
 * Get manual knowledge entry form schema
 */
export function getManualEntryFormSchema(
  category: string,
  t: (key: string) => string
): FormSchema {
  const categoryLabels: Record<string, string> = {
    policy: 'Check-in/Check-out Policy',
    room_type: 'Room Type',
    contact: 'Contact Information',
    local_info: 'Location & Address',
  };

  return {
    id: `manual-entry-${category}`,
    title: categoryLabels[category] || 'Additional Information',
    fields: [
      {
        key: 'content',
        type: 'textarea',
        label: t(`knowledge.manual.${category}Label`) || 'Details',
        placeholder: t(`knowledge.manual.${category}Placeholder`) || 'Enter information...',
        required: true,
        validation: {
          minLength: 10,
          message: 'Please provide more detail',
        },
      },
    ],
    submitLabel: 'Save',
    skipLabel: 'Skip for now',
  };
}
