export interface App {
  id: string
  name: string
  slug: string
  category: AppCategory
  summary: string
  logo?: string
  status: 'available' | 'coming-soon' | 'planned'
}

export type AppCategory =
  | 'ai-provider'
  | 'messaging'
  | 'pms'
  | 'booking'
  | 'payment'
  | 'automation'
  | 'productivity'

export const categoryLabels: Record<AppCategory, string> = {
  'ai-provider': 'AI Provider',
  'messaging': 'Messaging',
  'pms': 'Property Management',
  'booking': 'Booking Platform',
  'payment': 'Payment',
  'automation': 'Automation',
  'productivity': 'Productivity',
}

export const apps: App[] = [
  // AI Providers
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    slug: 'anthropic',
    category: 'ai-provider',
    summary: 'Advanced AI with nuanced understanding, ideal for complex guest conversations.',
    status: 'available',
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    slug: 'openai',
    category: 'ai-provider',
    summary: 'Industry-leading AI models for fast, reliable guest responses.',
    status: 'available',
  },
  {
    id: 'google-gemini',
    name: 'Google Gemini',
    slug: 'google-gemini',
    category: 'ai-provider',
    summary: 'Google\'s multimodal AI for text and image understanding.',
    status: 'coming-soon',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    slug: 'ollama',
    category: 'ai-provider',
    summary: 'Run open-source AI models locally for complete data privacy.',
    status: 'available',
  },
  {
    id: 'groq',
    name: 'Groq',
    slug: 'groq',
    category: 'ai-provider',
    summary: 'Ultra-fast AI inference for real-time guest interactions.',
    status: 'coming-soon',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    slug: 'mistral',
    category: 'ai-provider',
    summary: 'European AI provider with multilingual capabilities.',
    status: 'planned',
  },
  {
    id: 'local-ai',
    name: 'Local AI',
    slug: 'local-ai',
    category: 'ai-provider',
    summary: 'Built-in local AI using Transformers.js, no API keys needed.',
    status: 'available',
  },

  // Messaging Channels
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    slug: 'whatsapp',
    category: 'messaging',
    summary: 'Connect with guests on the world\'s most popular messaging app.',
    status: 'available',
  },
  {
    id: 'twilio-sms',
    name: 'Twilio SMS',
    slug: 'twilio-sms',
    category: 'messaging',
    summary: 'Send and receive SMS messages globally via Twilio.',
    status: 'available',
  },
  {
    id: 'email',
    name: 'Email (SMTP/IMAP)',
    slug: 'email',
    category: 'messaging',
    summary: 'Connect your email inbox for automated guest communication.',
    status: 'available',
  },
  {
    id: 'messenger',
    name: 'Facebook Messenger',
    slug: 'messenger',
    category: 'messaging',
    summary: 'Engage guests through Facebook Messenger integration.',
    status: 'planned',
  },
  {
    id: 'instagram',
    name: 'Instagram DM',
    slug: 'instagram',
    category: 'messaging',
    summary: 'Respond to guest inquiries via Instagram Direct Messages.',
    status: 'planned',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    slug: 'telegram',
    category: 'messaging',
    summary: 'Connect with guests on Telegram with bot integration.',
    status: 'planned',
  },
  {
    id: 'web-chat',
    name: 'Web Chat Widget',
    slug: 'web-chat',
    category: 'messaging',
    summary: 'Embed a chat widget on your website for instant guest support.',
    status: 'available',
  },

  // Property Management Systems
  {
    id: 'opera',
    name: 'Oracle Opera',
    slug: 'opera',
    category: 'pms',
    summary: 'Enterprise PMS integration for large hotel chains.',
    status: 'planned',
  },
  {
    id: 'mews',
    name: 'Mews',
    slug: 'mews',
    category: 'pms',
    summary: 'Modern cloud PMS with open API for seamless integration.',
    status: 'coming-soon',
  },
  {
    id: 'cloudbeds',
    name: 'Cloudbeds',
    slug: 'cloudbeds',
    category: 'pms',
    summary: 'All-in-one hospitality platform for independent properties.',
    status: 'coming-soon',
  },
  {
    id: 'little-hotelier',
    name: 'Little Hotelier',
    slug: 'little-hotelier',
    category: 'pms',
    summary: 'PMS designed for small hotels and B&Bs.',
    status: 'planned',
  },
  {
    id: 'guesty',
    name: 'Guesty',
    slug: 'guesty',
    category: 'pms',
    summary: 'Property management for short-term rental businesses.',
    status: 'coming-soon',
  },
  {
    id: 'hostaway',
    name: 'Hostaway',
    slug: 'hostaway',
    category: 'pms',
    summary: 'Vacation rental software with channel management.',
    status: 'planned',
  },
  {
    id: 'lodgify',
    name: 'Lodgify',
    slug: 'lodgify',
    category: 'pms',
    summary: 'Vacation rental software with website builder.',
    status: 'planned',
  },
  {
    id: 'roomraccoon',
    name: 'RoomRaccoon',
    slug: 'roomraccoon',
    category: 'pms',
    summary: 'Hotel management system with revenue optimization.',
    status: 'planned',
  },

  // Booking Platforms
  {
    id: 'booking-com',
    name: 'Booking.com',
    slug: 'booking-com',
    category: 'booking',
    summary: 'Sync reservations and guest data from Booking.com.',
    status: 'planned',
  },
  {
    id: 'airbnb',
    name: 'Airbnb',
    slug: 'airbnb',
    category: 'booking',
    summary: 'Import Airbnb reservations and guest information.',
    status: 'planned',
  },
  {
    id: 'expedia',
    name: 'Expedia',
    slug: 'expedia',
    category: 'booking',
    summary: 'Connect with Expedia for reservation management.',
    status: 'planned',
  },
  {
    id: 'vrbo',
    name: 'VRBO',
    slug: 'vrbo',
    category: 'booking',
    summary: 'Sync vacation rental bookings from VRBO.',
    status: 'planned',
  },

  // Payment
  {
    id: 'stripe',
    name: 'Stripe',
    slug: 'stripe',
    category: 'payment',
    summary: 'Accept payments and process refunds via Stripe.',
    status: 'planned',
  },
  {
    id: 'square',
    name: 'Square',
    slug: 'square',
    category: 'payment',
    summary: 'Process payments with Square point-of-sale integration.',
    status: 'planned',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    slug: 'paypal',
    category: 'payment',
    summary: 'Accept PayPal payments for bookings and services.',
    status: 'planned',
  },

  // Automation
  {
    id: 'zapier',
    name: 'Zapier',
    slug: 'zapier',
    category: 'automation',
    summary: 'Connect Jack to 5,000+ apps with no-code automation.',
    status: 'coming-soon',
  },
  {
    id: 'make',
    name: 'Make (Integromat)',
    slug: 'make',
    category: 'automation',
    summary: 'Build complex automation workflows visually.',
    status: 'planned',
  },
  {
    id: 'n8n',
    name: 'n8n',
    slug: 'n8n',
    category: 'automation',
    summary: 'Self-hosted workflow automation platform.',
    status: 'planned',
  },

  // Productivity
  {
    id: 'slack',
    name: 'Slack',
    slug: 'slack',
    category: 'productivity',
    summary: 'Get notifications and manage tasks from Slack.',
    status: 'coming-soon',
  },
  {
    id: 'microsoft-teams',
    name: 'Microsoft Teams',
    slug: 'microsoft-teams',
    category: 'productivity',
    summary: 'Integrate with Teams for staff collaboration.',
    status: 'planned',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    slug: 'google-calendar',
    category: 'productivity',
    summary: 'Sync tasks and appointments with Google Calendar.',
    status: 'planned',
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    slug: 'google-sheets',
    category: 'productivity',
    summary: 'Export reports and data to Google Sheets.',
    status: 'planned',
  },
]
