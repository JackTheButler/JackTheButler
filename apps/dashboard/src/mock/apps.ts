import type { LucideIcon } from 'lucide-react';
import {
  Globe,
  Phone,
  Send,
  Mail,
  MessageCircle,
  Bot,
  Sparkles,
  Cpu,
  BookOpen,
  FileText,
  Database,
  Zap,
  Building2,
} from 'lucide-react';

/**
 * App catalog (manifest-style, mirrors the integration pattern).
 *
 * This list is the single source of truth for the Apps page — adding an
 * integration is one entry here, no UI changes. Categories are derived from
 * the data, so new categories appear automatically.
 */

export type AppStatus = 'active' | 'available' | 'soon' | 'error';

export interface AppEntry {
  id: string;
  name: string;
  vendor: string;
  description: string;
  category: string;
  icon: LucideIcon;
  status: AppStatus;
}

export const apps: AppEntry[] = [
  // Channels
  {
    id: 'webchat',
    name: 'Webchat',
    vendor: 'Jane',
    description: 'Embeddable chat widget for your website.',
    category: 'Channels',
    icon: Globe,
    status: 'active',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    vendor: 'Meta Cloud API',
    description: 'Receive and reply to WhatsApp messages.',
    category: 'Channels',
    icon: Phone,
    status: 'available',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    vendor: 'Bot API',
    description: 'Connect a Telegram bot for support.',
    category: 'Channels',
    icon: Send,
    status: 'available',
  },
  {
    id: 'email',
    name: 'Email',
    vendor: 'SMTP / IMAP',
    description: 'Turn a support inbox into conversations.',
    category: 'Channels',
    icon: Mail,
    status: 'soon',
  },
  {
    id: 'sms',
    name: 'SMS',
    vendor: 'Twilio',
    description: 'Two-way SMS support.',
    category: 'Channels',
    icon: MessageCircle,
    status: 'soon',
  },

  // AI Models
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    vendor: 'Anthropic',
    description: 'Primary model for generating answers.',
    category: 'AI Models',
    icon: Sparkles,
    status: 'active',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    vendor: 'OpenAI',
    description: 'GPT models as an alternative provider.',
    category: 'AI Models',
    icon: Bot,
    status: 'available',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    vendor: 'Local',
    description: 'Run open models locally.',
    category: 'AI Models',
    icon: Cpu,
    status: 'soon',
  },

  // Knowledge
  {
    id: 'web-crawler',
    name: 'Website Crawler',
    vendor: 'Jane',
    description: 'Index your site into the knowledge base.',
    category: 'Knowledge',
    icon: Globe,
    status: 'error',
  },
  {
    id: 'notion',
    name: 'Notion',
    vendor: 'Notion',
    description: 'Sync help docs from Notion pages.',
    category: 'Knowledge',
    icon: FileText,
    status: 'soon',
  },
  {
    id: 'zendesk-kb',
    name: 'Zendesk Help Center',
    vendor: 'Zendesk',
    description: 'Import existing help-center articles.',
    category: 'Knowledge',
    icon: BookOpen,
    status: 'soon',
  },
  {
    id: 'gdrive',
    name: 'Google Drive',
    vendor: 'Google',
    description: 'Ingest documents from a Drive folder.',
    category: 'Knowledge',
    icon: Database,
    status: 'soon',
  },

  // CRM & Tools
  {
    id: 'slack-notify',
    name: 'Slack',
    vendor: 'Slack',
    description: 'Notify a channel on handoff or escalation.',
    category: 'CRM & Tools',
    icon: MessageCircle,
    status: 'available',
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    vendor: 'HubSpot',
    description: 'Link conversations to CRM contacts.',
    category: 'CRM & Tools',
    icon: Building2,
    status: 'soon',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    vendor: 'Zapier',
    description: 'Trigger automations on events.',
    category: 'CRM & Tools',
    icon: Zap,
    status: 'soon',
  },
];

/** Categories in display order, derived from the catalog. */
export const appCategories = [...new Set(apps.map((a) => a.category))];
