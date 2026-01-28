/**
 * Integration Registry
 *
 * Central registry of all available integrations and their providers.
 * This defines what integrations can be configured in the system.
 */

import type { IntegrationDefinition, ProviderDefinition } from './types.js';

/**
 * AI Provider integration
 */
const aiIntegration: IntegrationDefinition = {
  id: 'ai',
  name: 'AI Provider',
  category: 'ai',
  description: 'AI model for responses and intent classification',
  icon: 'brain',
  required: true,
  providers: [
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      description: 'Claude models via Anthropic API',
      docsUrl: 'https://docs.anthropic.com/',
      configSchema: [
        {
          key: 'apiKey',
          label: 'API Key',
          type: 'password',
          required: true,
          placeholder: 'sk-ant-...',
          helpText: 'Your Anthropic API key',
        },
        {
          key: 'model',
          label: 'Model',
          type: 'select',
          required: false,
          defaultValue: 'claude-sonnet-4-20250514',
          options: [
            { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
            { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
            { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
          ],
        },
        {
          key: 'maxTokens',
          label: 'Max Tokens',
          type: 'number',
          required: false,
          defaultValue: 1024,
          helpText: 'Maximum tokens in response',
        },
      ],
    },
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'GPT models via OpenAI API',
      docsUrl: 'https://platform.openai.com/docs',
      configSchema: [
        {
          key: 'apiKey',
          label: 'API Key',
          type: 'password',
          required: true,
          placeholder: 'sk-...',
          helpText: 'Your OpenAI API key',
        },
        {
          key: 'model',
          label: 'Model',
          type: 'select',
          required: false,
          defaultValue: 'gpt-4o',
          options: [
            { value: 'gpt-4o', label: 'GPT-4o' },
            { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
            { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
          ],
        },
        {
          key: 'maxTokens',
          label: 'Max Tokens',
          type: 'number',
          required: false,
          defaultValue: 1024,
        },
      ],
    },
    {
      id: 'ollama',
      name: 'Ollama (Local)',
      description: 'Local models via Ollama',
      docsUrl: 'https://ollama.ai/docs',
      configSchema: [
        {
          key: 'baseUrl',
          label: 'Base URL',
          type: 'text',
          required: true,
          placeholder: 'http://localhost:11434',
          defaultValue: 'http://localhost:11434',
          helpText: 'URL of your Ollama server',
        },
        {
          key: 'model',
          label: 'Model',
          type: 'text',
          required: true,
          placeholder: 'llama3',
          helpText: 'Name of the Ollama model to use',
        },
      ],
    },
  ],
};

/**
 * WhatsApp integration
 */
const whatsappIntegration: IntegrationDefinition = {
  id: 'whatsapp',
  name: 'WhatsApp',
  category: 'channels',
  description: 'WhatsApp Business messaging',
  icon: 'message-circle',
  providers: [
    {
      id: 'meta',
      name: 'Meta Business API',
      description: 'Official WhatsApp Business API via Meta',
      docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
      configSchema: [
        {
          key: 'accessToken',
          label: 'Access Token',
          type: 'password',
          required: true,
          helpText: 'Permanent access token from Meta Business',
        },
        {
          key: 'phoneNumberId',
          label: 'Phone Number ID',
          type: 'text',
          required: true,
          helpText: 'WhatsApp Business phone number ID',
        },
        {
          key: 'verifyToken',
          label: 'Webhook Verify Token',
          type: 'text',
          required: true,
          helpText: 'Token used to verify webhook endpoint',
        },
        {
          key: 'appSecret',
          label: 'App Secret',
          type: 'password',
          required: false,
          helpText: 'App secret for signature verification (recommended)',
        },
      ],
    },
  ],
};

/**
 * SMS integration
 */
const smsIntegration: IntegrationDefinition = {
  id: 'sms',
  name: 'SMS',
  category: 'channels',
  description: 'SMS text messaging',
  icon: 'smartphone',
  providers: [
    {
      id: 'twilio',
      name: 'Twilio',
      description: 'SMS via Twilio',
      docsUrl: 'https://www.twilio.com/docs/sms',
      configSchema: [
        {
          key: 'accountSid',
          label: 'Account SID',
          type: 'text',
          required: true,
          placeholder: 'AC...',
          helpText: 'Your Twilio Account SID',
        },
        {
          key: 'authToken',
          label: 'Auth Token',
          type: 'password',
          required: true,
          helpText: 'Your Twilio Auth Token',
        },
        {
          key: 'phoneNumber',
          label: 'Phone Number',
          type: 'text',
          required: true,
          placeholder: '+1234567890',
          helpText: 'Twilio phone number to send from',
        },
      ],
    },
    {
      id: 'vonage',
      name: 'Vonage',
      description: 'SMS via Vonage (Nexmo)',
      docsUrl: 'https://developer.vonage.com/messaging/sms/overview',
      configSchema: [
        {
          key: 'apiKey',
          label: 'API Key',
          type: 'text',
          required: true,
        },
        {
          key: 'apiSecret',
          label: 'API Secret',
          type: 'password',
          required: true,
        },
        {
          key: 'fromNumber',
          label: 'From Number',
          type: 'text',
          required: true,
          placeholder: '+1234567890',
        },
      ],
    },
  ],
};

/**
 * Email integration
 */
const emailIntegration: IntegrationDefinition = {
  id: 'email',
  name: 'Email',
  category: 'channels',
  description: 'Email messaging',
  icon: 'mail',
  multiProvider: true, // Can have SMTP for sending, IMAP for receiving
  providers: [
    {
      id: 'smtp',
      name: 'SMTP (Direct)',
      description: 'Direct SMTP/IMAP connection',
      configSchema: [
        {
          key: 'smtpHost',
          label: 'SMTP Host',
          type: 'text',
          required: true,
          placeholder: 'smtp.gmail.com',
        },
        {
          key: 'smtpPort',
          label: 'SMTP Port',
          type: 'number',
          required: true,
          defaultValue: 587,
        },
        {
          key: 'smtpUser',
          label: 'SMTP Username',
          type: 'text',
          required: true,
        },
        {
          key: 'smtpPass',
          label: 'SMTP Password',
          type: 'password',
          required: true,
        },
        {
          key: 'smtpSecure',
          label: 'Use TLS',
          type: 'boolean',
          required: false,
          defaultValue: true,
        },
        {
          key: 'imapHost',
          label: 'IMAP Host',
          type: 'text',
          required: false,
          placeholder: 'imap.gmail.com',
          helpText: 'Required for receiving emails',
        },
        {
          key: 'imapPort',
          label: 'IMAP Port',
          type: 'number',
          required: false,
          defaultValue: 993,
        },
        {
          key: 'imapUser',
          label: 'IMAP Username',
          type: 'text',
          required: false,
        },
        {
          key: 'imapPass',
          label: 'IMAP Password',
          type: 'password',
          required: false,
        },
        {
          key: 'fromAddress',
          label: 'From Address',
          type: 'text',
          required: true,
          placeholder: 'concierge@hotel.com',
        },
        {
          key: 'fromName',
          label: 'From Name',
          type: 'text',
          required: false,
          placeholder: 'Hotel Concierge',
        },
      ],
    },
    {
      id: 'mailgun',
      name: 'Mailgun',
      description: 'Email via Mailgun API',
      docsUrl: 'https://documentation.mailgun.com/',
      configSchema: [
        {
          key: 'apiKey',
          label: 'API Key',
          type: 'password',
          required: true,
        },
        {
          key: 'domain',
          label: 'Domain',
          type: 'text',
          required: true,
          placeholder: 'mg.yourdomain.com',
        },
        {
          key: 'fromAddress',
          label: 'From Address',
          type: 'text',
          required: true,
        },
        {
          key: 'region',
          label: 'Region',
          type: 'select',
          required: false,
          defaultValue: 'us',
          options: [
            { value: 'us', label: 'US' },
            { value: 'eu', label: 'EU' },
          ],
        },
      ],
    },
    {
      id: 'sendgrid',
      name: 'SendGrid',
      description: 'Email via SendGrid API',
      docsUrl: 'https://docs.sendgrid.com/',
      configSchema: [
        {
          key: 'apiKey',
          label: 'API Key',
          type: 'password',
          required: true,
        },
        {
          key: 'fromAddress',
          label: 'From Address',
          type: 'text',
          required: true,
        },
        {
          key: 'fromName',
          label: 'From Name',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};

/**
 * Web Chat integration
 */
const webchatIntegration: IntegrationDefinition = {
  id: 'webchat',
  name: 'Web Chat',
  category: 'channels',
  description: "Built-in web chat widget",
  icon: 'message-square',
  providers: [
    {
      id: 'builtin',
      name: 'Built-in Widget',
      description: "Jack's built-in chat widget",
      configSchema: [
        {
          key: 'enabled',
          label: 'Enabled',
          type: 'boolean',
          required: true,
          defaultValue: true,
        },
        {
          key: 'primaryColor',
          label: 'Primary Color',
          type: 'text',
          required: false,
          placeholder: '#3B82F6',
          defaultValue: '#3B82F6',
        },
        {
          key: 'position',
          label: 'Position',
          type: 'select',
          required: false,
          defaultValue: 'bottom-right',
          options: [
            { value: 'bottom-right', label: 'Bottom Right' },
            { value: 'bottom-left', label: 'Bottom Left' },
          ],
        },
        {
          key: 'welcomeMessage',
          label: 'Welcome Message',
          type: 'text',
          required: false,
          defaultValue: 'Hello! How can I help you today?',
        },
      ],
    },
  ],
};

/**
 * PMS integration
 */
const pmsIntegration: IntegrationDefinition = {
  id: 'pms',
  name: 'Property Management System',
  category: 'pms',
  description: 'Hotel PMS for guest and reservation data',
  icon: 'building',
  providers: [
    {
      id: 'mock',
      name: 'Mock (Development)',
      description: 'Simulated PMS for development',
      configSchema: [
        {
          key: 'enabled',
          label: 'Enabled',
          type: 'boolean',
          required: true,
          defaultValue: true,
        },
      ],
    },
    {
      id: 'mews',
      name: 'Mews',
      description: 'Mews PMS integration',
      docsUrl: 'https://mews-systems.gitbook.io/connector-api/',
      configSchema: [
        {
          key: 'apiUrl',
          label: 'API URL',
          type: 'text',
          required: true,
          placeholder: 'https://api.mews.com',
        },
        {
          key: 'clientToken',
          label: 'Client Token',
          type: 'password',
          required: true,
        },
        {
          key: 'accessToken',
          label: 'Access Token',
          type: 'password',
          required: true,
        },
      ],
    },
    {
      id: 'opera',
      name: 'Oracle Opera Cloud',
      description: 'Opera Cloud PMS integration',
      docsUrl: 'https://docs.oracle.com/en/industries/hospitality/',
      configSchema: [
        {
          key: 'apiUrl',
          label: 'API URL',
          type: 'text',
          required: true,
        },
        {
          key: 'clientId',
          label: 'Client ID',
          type: 'text',
          required: true,
        },
        {
          key: 'clientSecret',
          label: 'Client Secret',
          type: 'password',
          required: true,
        },
        {
          key: 'hotelId',
          label: 'Hotel ID',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'cloudbeds',
      name: 'Cloudbeds',
      description: 'Cloudbeds PMS integration',
      docsUrl: 'https://hotels.cloudbeds.com/api/docs/',
      configSchema: [
        {
          key: 'apiKey',
          label: 'API Key',
          type: 'password',
          required: true,
        },
        {
          key: 'propertyId',
          label: 'Property ID',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
};

/**
 * All available integrations
 */
export const integrationRegistry: IntegrationDefinition[] = [
  aiIntegration,
  whatsappIntegration,
  smsIntegration,
  emailIntegration,
  webchatIntegration,
  pmsIntegration,
];

/**
 * Get an integration definition by ID
 */
export function getIntegrationDefinition(id: string): IntegrationDefinition | undefined {
  return integrationRegistry.find((i) => i.id === id);
}

/**
 * Get a provider definition by integration and provider ID
 */
export function getProviderDefinition(
  integrationId: string,
  providerId: string
): ProviderDefinition | undefined {
  const integration = getIntegrationDefinition(integrationId);
  return integration?.providers.find((p) => p.id === providerId);
}

/**
 * Get all integrations by category
 */
export function getIntegrationsByCategory(
  category: IntegrationDefinition['category']
): IntegrationDefinition[] {
  return integrationRegistry.filter((i) => i.category === category);
}
