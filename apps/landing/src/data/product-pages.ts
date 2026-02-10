// Product page configurations for hotel, airbnb, and hostel landing pages

export type ProductType = 'hotel' | 'airbnb' | 'hostel'

export interface ProductConfig {
  // SEO
  title: string
  metaDescription: string

  // Hero
  heroHighlight: string
  heroTitle: string
  heroDescription: string

  // Explainer
  explainerBadge: string
  explainerTitle: string
  explainerDescription: string
  howItWorksText: string
  howItWorksDescription: string
  features: string[]
  highlightText: string

  // Feature grid
  featureGridTitle: string
  featureGridSubtitle: string

  // Comparison
  comparisonTitle: string
  comparisonSubtitle: string

  // How it works
  howItWorksTitle: string
  steps: { title: string; description: string }[]

  // FAQ
  faqTitle: string
  faqItems: { question: string; answer: string }[]

  // CTA
  ctaTitle: string
  ctaSubtitle: string

  // Footer
  footerTagline: string
}

// Shared features for all product types
const sharedFeatures = [
  { icon: 'dollar' as const, title: '100% Free', description: 'No subscription fees. No per-message costs. No per-room pricing. Just pay for your server (~$5/month).', color: 'emerald' as const },
  { icon: 'shield' as const, title: 'Self-Hosted', description: 'Your guest data stays on your server. Full GDPR compliance. No third-party data sharing.', color: 'blue' as const },
  { icon: 'clock' as const, title: '24/7 Responses', description: 'Guests get instant answers at 3am. No more missed messages or delayed responses.', color: 'purple' as const },
  { icon: 'message' as const, title: 'Multi-Channel', description: 'WhatsApp, SMS, email, and web chat — all in one unified inbox for your team.', color: 'orange' as const },
  { icon: 'zap' as const, title: 'Easy Setup', description: 'Deploy in 5 minutes with one click. No technical expertise required.', color: 'red' as const },
  { icon: 'globe' as const, title: 'Open Source', description: 'Full transparency. Customize anything. No vendor lock-in. Community supported.', color: 'cyan' as const },
]

// Shared comparison rows
const sharedComparisonRows = [
  { feature: 'Monthly Price', jack: 'Free', jackPositive: true, others: '$200 - $2,000' },
  { feature: 'Per-Message Fees', jack: 'None', jackPositive: true, others: '$0.01 - $0.10' },
  { feature: 'Self-Hosted', jack: '✓ Yes', jackPositive: true, others: '✗ No', othersPositive: false },
  { feature: 'Open Source', jack: '✓ Yes', jackPositive: true, others: '✗ No', othersPositive: false },
  { feature: 'Data Ownership', jack: '100% Yours', jackPositive: true, others: 'Vendor Servers' },
  { feature: 'WhatsApp Support', jack: '✓ Yes', jackPositive: true, others: '✓ Yes', othersPositive: true },
  { feature: 'Local AI Option', jack: '✓ Yes', jackPositive: true, others: '✗ No', othersPositive: false },
  { feature: 'Setup Time', jack: '5 minutes', jackPositive: false, others: 'Days to weeks' },
]

export const productConfigs: Record<ProductType, ProductConfig> = {
  hotel: {
    title: 'Free Hotel Chatbot - Open Source AI Guest Messaging | Jack The Butler',
    metaDescription: 'Looking for a hotel chatbot? Jack is a free, open-source AI chatbot for hotels. Automate WhatsApp, SMS & email guest messaging 24/7. Self-hosted, no per-message fees.',

    heroHighlight: 'Hotel Chatbot',
    heroTitle: 'That Actually Works',
    heroDescription: 'Jack is an open-source AI chatbot for hotels that handles WhatsApp, SMS, and email automatically. No per-message fees. No expensive subscriptions. Self-hosted on your server.',

    explainerBadge: 'Understanding Hotel Chatbots',
    explainerTitle: 'What is a Hotel Chatbot?',
    explainerDescription: 'A <strong class="text-neutral-900 dark:text-white">hotel chatbot</strong> is an AI-powered assistant that automatically responds to guest inquiries across messaging channels — providing instant answers 24/7.',
    howItWorksText: 'Modern hotel chatbots use artificial intelligence to understand guest questions and provide helpful, contextual responses — just like a real concierge, but available around the clock.',
    howItWorksDescription: 'The best hotel chatbots know when to <strong class="text-neutral-900 dark:text-white">escalate complex issues</strong> to human staff, ensuring guests always get the help they need.',
    features: [
      'Check-in/check-out times and procedures',
      'Room amenities and hotel facilities',
      'Restaurant hours and menu information',
      'Local recommendations and directions',
      'Booking modifications and cancellations',
      'Special requests and room service',
    ],
    highlightText: 'With a hotel chatbot, guests get instant answers at 3am — and your staff can focus on what matters most.',

    featureGridTitle: 'Why Choose Jack as Your Hotel Chatbot?',
    featureGridSubtitle: 'Most hotel chatbots charge $200-2000/month plus per-message fees. Jack is different.',

    comparisonTitle: 'Jack vs Other Hotel Chatbots',
    comparisonSubtitle: 'See how Jack compares to expensive SaaS hotel chatbot solutions.',

    howItWorksTitle: 'How Jack Works',
    steps: [
      { title: 'Guest Sends a Message', description: 'A guest messages your hotel via WhatsApp, SMS, email, or web chat. Jack receives it instantly.' },
      { title: 'AI Understands the Request', description: "Jack's AI analyzes the message, checks your hotel's knowledge base, and determines the best response." },
      { title: 'Instant Response or Escalation', description: 'For routine questions, Jack responds instantly. For complex requests, it creates a task and notifies the right staff member.' },
      { title: 'Staff Stays in Control', description: 'Your team monitors conversations in a unified dashboard, jumping in when needed. Full visibility, no surprises.' },
    ],

    faqTitle: 'Hotel Chatbot FAQ',
    faqItems: [
      { question: 'How much does a hotel chatbot cost?', answer: 'Most hotel chatbots charge $200-2000/month plus per-message fees. Jack The Butler is completely free — you only pay for server hosting (~$5/month) and optional AI API usage (~$10-20/month depending on volume).' },
      { question: 'Can a hotel chatbot handle WhatsApp?', answer: 'Yes! Jack supports WhatsApp Business API integration. Guests can message your hotel directly on WhatsApp and receive instant AI-powered responses 24/7.' },
      { question: 'Is a self-hosted chatbot secure?', answer: 'Self-hosted is actually more secure than SaaS solutions. Your guest data never leaves your server. You have full control over security, backups, and compliance. Jack is fully GDPR compliant by design.' },
      { question: 'What AI does the chatbot use?', answer: 'Jack supports multiple AI providers: Anthropic Claude, OpenAI GPT, Ollama for local models, and built-in local AI that runs entirely on your server with no API costs.' },
      { question: 'How long does it take to set up?', answer: 'Jack can be deployed in about 5 minutes using our one-click deploy buttons. The setup wizard guides you through configuring your property info, AI provider, and knowledge base.' },
    ],

    ctaTitle: 'Ready to Deploy Your Hotel Chatbot?',
    ctaSubtitle: 'Join hotels using Jack to automate guest communication. Free forever, deploy in 5 minutes.',

    footerTagline: 'The free, open-source hotel chatbot',
  },

  airbnb: {
    title: 'Free Airbnb Chatbot - AI Guest Messaging for Vacation Rentals | Jack The Butler',
    metaDescription: 'Looking for an Airbnb chatbot? Jack is a free, open-source AI chatbot for vacation rentals. Automate guest messaging on WhatsApp, SMS & email 24/7. Perfect for remote hosts.',

    heroHighlight: 'Airbnb Chatbot',
    heroTitle: 'For Remote Hosts',
    heroDescription: 'Jack is an open-source AI chatbot for Airbnb and vacation rental hosts. Handle guest messages automatically — even when you\'re asleep or managing multiple properties.',

    explainerBadge: 'Understanding Vacation Rental Chatbots',
    explainerTitle: 'What is an Airbnb Chatbot?',
    explainerDescription: 'An <strong class="text-neutral-900 dark:text-white">Airbnb chatbot</strong> is an AI assistant that automatically responds to guest inquiries for vacation rentals — helping remote hosts provide instant support 24/7.',
    howItWorksText: 'Modern vacation rental chatbots use AI to understand guest questions and provide helpful responses — perfect for hosts managing properties remotely or juggling multiple listings.',
    howItWorksDescription: 'The best Airbnb chatbots know when to <strong class="text-neutral-900 dark:text-white">alert the host</strong> for important issues while handling routine questions automatically.',
    features: [
      'Check-in instructions and access codes',
      'WiFi passwords and house rules',
      'Local recommendations and directions',
      'Appliance instructions and troubleshooting',
      'Early check-in and late checkout requests',
      'Emergency contacts and support',
    ],
    highlightText: 'With an Airbnb chatbot, guests get instant answers while you sleep — and your reviews improve automatically.',

    featureGridTitle: 'Why Choose Jack for Your Vacation Rental?',
    featureGridSubtitle: 'Most Airbnb automation tools charge monthly fees. Jack is completely free to self-host.',

    comparisonTitle: 'Jack vs Other Airbnb Chatbots',
    comparisonSubtitle: 'See how Jack compares to paid vacation rental messaging tools.',

    howItWorksTitle: 'How Jack Works for Airbnb Hosts',
    steps: [
      { title: 'Guest Sends a Message', description: 'A guest messages you via WhatsApp, SMS, email, or your direct booking site. Jack receives it instantly.' },
      { title: 'AI Understands the Request', description: "Jack's AI analyzes the message, checks your property's knowledge base (house rules, WiFi, etc.), and determines the best response." },
      { title: 'Instant Response or Alert', description: 'For routine questions like WiFi or check-in, Jack responds instantly. For issues needing your attention, it alerts you immediately.' },
      { title: 'Manage Multiple Properties', description: 'One dashboard for all your listings. Jack knows which property each guest is asking about and responds with the right information.' },
    ],

    faqTitle: 'Airbnb Chatbot FAQ',
    faqItems: [
      { question: 'Does this work with Airbnb messaging?', answer: 'Jack works alongside Airbnb. Share your WhatsApp or direct contact in your listing, and Jack handles those messages automatically. Many hosts prefer this for faster response times.' },
      { question: 'Can I manage multiple properties?', answer: 'Yes! Jack supports multiple properties in one dashboard. Each property has its own knowledge base with specific check-in instructions, WiFi passwords, and house rules.' },
      { question: 'Will this help my Airbnb reviews?', answer: 'Absolutely. Fast response times are a top factor in guest reviews. Jack responds instantly 24/7, helping you maintain Superhost status.' },
      { question: 'What if a guest has an emergency?', answer: "Jack can detect urgent messages and immediately alert you via push notification, SMS, or email. You'll never miss a real emergency." },
      { question: 'How do I set up check-in instructions?', answer: 'The setup wizard helps you add your property info, access codes, and house rules. Jack learns your specific instructions and shares them at the right time.' },
    ],

    ctaTitle: 'Ready to Automate Your Airbnb Messaging?',
    ctaSubtitle: 'Join hosts using Jack to provide 5-star guest communication. Free forever, deploy in 5 minutes.',

    footerTagline: 'The free, open-source vacation rental chatbot',
  },

  hostel: {
    title: 'Free Hostel Chatbot - AI Guest Messaging for Hostels | Jack The Butler',
    metaDescription: 'Looking for a hostel chatbot? Jack is a free, open-source AI chatbot for hostels. Handle high-volume guest messaging on WhatsApp, SMS & email 24/7. Budget-friendly automation.',

    heroHighlight: 'Hostel Chatbot',
    heroTitle: 'For Budget-Smart Hostels',
    heroDescription: 'Jack is an open-source AI chatbot built for hostels. Handle high-volume guest inquiries automatically — without the enterprise price tag.',

    explainerBadge: 'Understanding Hostel Chatbots',
    explainerTitle: 'What is a Hostel Chatbot?',
    explainerDescription: 'A <strong class="text-neutral-900 dark:text-white">hostel chatbot</strong> is an AI assistant that handles the high volume of guest questions hostels receive — from dorm availability to social events — automatically.',
    howItWorksText: 'Hostels get more messages per bed than hotels. A chatbot handles repetitive questions about lockers, common areas, and events — freeing staff for the social experience hostels are known for.',
    howItWorksDescription: 'The best hostel chatbots <strong class="text-neutral-900 dark:text-white">understand the hostel vibe</strong> — casual, helpful, and focused on the community experience.',
    features: [
      'Dorm availability and bed types',
      'Locker information and security',
      'Common area hours and facilities',
      'Social events and activities',
      'Kitchen rules and amenities',
      'Walking tours and local tips',
    ],
    highlightText: 'With a hostel chatbot, backpackers get instant answers — and your staff can focus on creating memorable experiences.',

    featureGridTitle: 'Why Choose Jack for Your Hostel?',
    featureGridSubtitle: 'Enterprise chatbots are priced for luxury hotels. Jack is free — perfect for hostel budgets.',

    comparisonTitle: 'Jack vs Other Hostel Solutions',
    comparisonSubtitle: 'See how Jack compares to expensive hospitality chatbots.',

    howItWorksTitle: 'How Jack Works for Hostels',
    steps: [
      { title: 'Backpacker Sends a Message', description: 'A guest messages your hostel via WhatsApp, SMS, email, or web chat. Jack receives it instantly — even at 3am.' },
      { title: 'AI Understands the Vibe', description: "Jack's AI analyzes the message and responds in a friendly, casual tone that matches hostel culture." },
      { title: 'Instant Answers for Common Questions', description: "Locker sizes? Kitchen hours? Tonight's pub crawl? Jack handles the repetitive questions that eat up staff time." },
      { title: 'Staff Handles the Real Stuff', description: 'Your team focuses on check-ins, events, and creating the social atmosphere guests love. Jack handles the FAQ.' },
    ],

    faqTitle: 'Hostel Chatbot FAQ',
    faqItems: [
      { question: 'Is this really free for hostels?', answer: "Yes! Jack is open-source and free. You only pay for basic hosting (~$5/month). That's less than what you'd spend on one night's revenue from a dorm bed." },
      { question: 'Can it handle high message volume?', answer: "Absolutely. Hostels get more messages per bed than hotels. Jack handles hundreds of conversations simultaneously with instant responses." },
      { question: 'Does it sound too corporate?', answer: "No way. You can customize Jack's tone to be casual and friendly — matching the hostel vibe. No stiff corporate responses." },
      { question: 'Can it promote our events?', answer: 'Yes! Add your walking tours, pub crawls, and social events to the knowledge base. Jack will mention them when relevant.' },
      { question: 'What about group bookings?', answer: 'Jack can handle initial inquiries and collect details, then escalate to staff for group booking arrangements.' },
    ],

    ctaTitle: 'Ready to Automate Your Hostel Messaging?',
    ctaSubtitle: 'Join hostels using Jack to handle guest messages. Free forever, deploy in 5 minutes.',

    footerTagline: 'The free, open-source hostel chatbot',
  },
}

export const sharedData = {
  features: sharedFeatures,
  comparisonRows: sharedComparisonRows,
}
