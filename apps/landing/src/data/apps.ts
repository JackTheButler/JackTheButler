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
  | 'pms'
  | 'smart-lock'
  | 'messaging'
  | 'distribution'
  | 'revenue'
  | 'guest-experience'
  | 'operations'
  | 'payment'
  | 'automation'

export const categoryLabels: Record<AppCategory, string> = {
  'ai-provider': 'AI Provider',
  'pms': 'Property Management',
  'smart-lock': 'Smart Lock',
  'messaging': 'Messaging',
  'distribution': 'Distribution',
  'revenue': 'Revenue Management',
  'guest-experience': 'Guest Experience',
  'operations': 'Operations',
  'payment': 'Payment',
  'automation': 'Automation',
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
  {
    id: 'apaleo',
    name: 'Apaleo',
    slug: 'apaleo',
    category: 'pms',
    summary: 'API-first property management platform for modern hotels.',
    status: 'planned',
  },
  {
    id: 'stayntouch',
    name: 'Stayntouch',
    slug: 'stayntouch',
    category: 'pms',
    summary: 'Cloud PMS with mobile-first guest experience.',
    status: 'planned',
  },
  {
    id: 'clock-pms',
    name: 'Clock PMS',
    slug: 'clock-pms',
    category: 'pms',
    summary: 'All-in-one cloud hotel management system.',
    status: 'planned',
  },
  {
    id: 'hotelogix',
    name: 'Hotelogix',
    slug: 'hotelogix',
    category: 'pms',
    summary: 'Cloud-based PMS for hotels and resorts.',
    status: 'planned',
  },
  {
    id: 'innroad',
    name: 'innRoad',
    slug: 'innroad',
    category: 'pms',
    summary: 'Hotel management software for independent properties.',
    status: 'planned',
  },
  {
    id: 'webrezpro',
    name: 'WebRezPro',
    slug: 'webrezpro',
    category: 'pms',
    summary: 'Cloud PMS for hotels, inns, and vacation rentals.',
    status: 'planned',
  },
  {
    id: 'sirvoy',
    name: 'Sirvoy',
    slug: 'sirvoy',
    category: 'pms',
    summary: 'Simple booking system for small accommodations.',
    status: 'planned',
  },
  {
    id: 'eviivo',
    name: 'eviivo',
    slug: 'eviivo',
    category: 'pms',
    summary: 'Booking and property management for B&Bs and small hotels.',
    status: 'planned',
  },

  // Channel Managers
  {
    id: 'siteminder',
    name: 'SiteMinder',
    slug: 'siteminder',
    category: 'distribution',
    summary: 'Leading channel manager connecting to 450+ booking sites.',
    status: 'planned',
  },
  {
    id: 'rentals-united',
    name: 'Rentals United',
    slug: 'rentals-united',
    category: 'distribution',
    summary: 'Channel manager for vacation rental properties.',
    status: 'planned',
  },

  // Booking Platforms
  {
    id: 'booking-com',
    name: 'Booking.com',
    slug: 'booking-com',
    category: 'distribution',
    summary: 'Sync reservations and guest data from Booking.com.',
    status: 'planned',
  },
  {
    id: 'airbnb',
    name: 'Airbnb',
    slug: 'airbnb',
    category: 'distribution',
    summary: 'Import Airbnb reservations and guest information.',
    status: 'planned',
  },
  {
    id: 'expedia',
    name: 'Expedia',
    slug: 'expedia',
    category: 'distribution',
    summary: 'Connect with Expedia for reservation management.',
    status: 'planned',
  },
  {
    id: 'vrbo',
    name: 'VRBO',
    slug: 'vrbo',
    category: 'distribution',
    summary: 'Sync vacation rental bookings from VRBO.',
    status: 'planned',
  },

  // Smart Locks
  {
    id: 'nuki',
    name: 'Nuki',
    slug: 'nuki',
    category: 'smart-lock',
    summary: 'Smart lock solution for keyless guest access.',
    status: 'planned',
  },
  {
    id: 'igloohome',
    name: 'igloohome',
    slug: 'igloohome',
    category: 'smart-lock',
    summary: 'Smart locks and lockboxes for property access.',
    status: 'planned',
  },
  {
    id: 'remotelock',
    name: 'RemoteLock',
    slug: 'remotelock',
    category: 'smart-lock',
    summary: 'Cloud-based access control for hospitality.',
    status: 'planned',
  },
  {
    id: 'salto',
    name: 'SALTO',
    slug: 'salto',
    category: 'smart-lock',
    summary: 'Electronic access control systems for hotels.',
    status: 'planned',
  },
  {
    id: 'ttlock',
    name: 'TTLock',
    slug: 'ttlock',
    category: 'smart-lock',
    summary: 'Smart lock platform with mobile key support.',
    status: 'planned',
  },
  {
    id: 'yale-august',
    name: 'Yale / August',
    slug: 'yale-august',
    category: 'smart-lock',
    summary: 'Consumer smart locks with rental integration.',
    status: 'planned',
  },

  // Revenue Management
  {
    id: 'pricelabs',
    name: 'PriceLabs',
    slug: 'pricelabs',
    category: 'revenue',
    summary: 'Dynamic pricing for vacation rentals and hotels.',
    status: 'planned',
  },
  {
    id: 'beyond-pricing',
    name: 'Beyond Pricing',
    slug: 'beyond-pricing',
    category: 'revenue',
    summary: 'Revenue management for short-term rentals.',
    status: 'planned',
  },
  {
    id: 'wheelhouse',
    name: 'Wheelhouse',
    slug: 'wheelhouse',
    category: 'revenue',
    summary: 'Dynamic pricing and market analytics.',
    status: 'planned',
  },
  {
    id: 'duetto',
    name: 'Duetto',
    slug: 'duetto',
    category: 'revenue',
    summary: 'Revenue strategy platform for hotels.',
    status: 'planned',
  },

  // Guest Experience
  {
    id: 'oaky',
    name: 'Oaky',
    slug: 'oaky',
    category: 'guest-experience',
    summary: 'Upselling software to boost ancillary revenue.',
    status: 'planned',
  },
  {
    id: 'guestjoy',
    name: 'GuestJoy',
    slug: 'guestjoy',
    category: 'guest-experience',
    summary: 'Guest engagement and upselling platform.',
    status: 'planned',
  },

  // Operations
  {
    id: 'flexkeeping',
    name: 'Flexkeeping',
    slug: 'flexkeeping',
    category: 'operations',
    summary: 'Housekeeping and maintenance management.',
    status: 'planned',
  },
  {
    id: 'hotelkit',
    name: 'hotelkit',
    slug: 'hotelkit',
    category: 'operations',
    summary: 'Hotel operations and team collaboration platform.',
    status: 'planned',
  },

  // Reviews
  {
    id: 'trustyou',
    name: 'TrustYou',
    slug: 'trustyou',
    category: 'operations',
    summary: 'Guest feedback and reputation management.',
    status: 'planned',
  },
  {
    id: 'reviewpro',
    name: 'ReviewPro',
    slug: 'reviewpro',
    category: 'operations',
    summary: 'Guest intelligence and review management.',
    status: 'planned',
  },

  // Concierge / Activities
  {
    id: 'viator',
    name: 'Viator',
    slug: 'viator',
    category: 'guest-experience',
    summary: 'Book tours and activities for guests.',
    status: 'planned',
  },
  {
    id: 'getyourguide',
    name: 'GetYourGuide',
    slug: 'getyourguide',
    category: 'guest-experience',
    summary: 'Local experiences and attraction bookings.',
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
    category: 'automation',
    summary: 'Get notifications and manage tasks from Slack.',
    status: 'coming-soon',
  },
  {
    id: 'microsoft-teams',
    name: 'Microsoft Teams',
    slug: 'microsoft-teams',
    category: 'automation',
    summary: 'Integrate with Teams for staff collaboration.',
    status: 'planned',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    slug: 'google-calendar',
    category: 'automation',
    summary: 'Sync tasks and appointments with Google Calendar.',
    status: 'planned',
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    slug: 'google-sheets',
    category: 'automation',
    summary: 'Export reports and data to Google Sheets.',
    status: 'planned',
  },
]
