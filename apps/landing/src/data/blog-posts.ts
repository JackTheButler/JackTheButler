export interface Author {
  slug: string
  name: string
  bio: string
  avatar: string
  linkedin?: string
}

export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  readTime: string
  category: string
  image?: string
  author: Author
}

export const authors: Record<string, Author> = {
  arash: {
    slug: 'arash',
    name: 'Arash K.',
    bio: 'Tech entrepreneur who founded Goki SmartLock in 2014, revolutionizing property access with secure remote automation. Creator of Jack The Butler, the free open-source AI concierge for hospitality.',
    avatar: '/arash.png',
    linkedin: 'https://www.linkedin.com/in/karimzadeh/'
  }
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'best-hotel-chatbots',
    title: '10 Best Hotel Chatbots Compared: Features, Pricing & Reviews (2026)',
    description: 'Compare the top 10 hotel chatbot solutions. See features, pricing, pros/cons, and find the best chatbot for your needs and budget.',
    date: '2026-03-24',
    readTime: '15 min read',
    category: 'Guides',
    image: '/blog/best-hotel-chatbots.jpeg',
    author: authors.arash
  },
  {
    slug: 'hotel-virtual-assistant',
    title: 'Hotel Virtual Assistant: AI-Powered Guest Service Guide (2026)',
    description: 'Learn how hotel virtual assistants use AI to handle guest requests and improve service quality 24/7 without additional staff.',
    date: '2026-03-17',
    readTime: '9 min read',
    category: 'Education',
    image: '/blog/hotel-virtual-assistant.jpeg',
    author: authors.arash
  },
  {
    slug: 'guest-messaging-platform',
    title: 'Guest Messaging Platform: Complete Guide for Hotels (2026)',
    description: 'Discover how guest messaging platforms transform hotel communication. Compare features, pricing, and learn how to choose the right solution.',
    date: '2026-03-06',
    readTime: '10 min read',
    category: 'Guides',
    image: '/blog/guest-messaging-platform.jpeg',
    author: authors.arash
  },
  {
    slug: 'open-source-hotel-chatbot-setup',
    title: 'Open Source Hotel Chatbot: Complete Setup Guide (2026)',
    description: 'Step-by-step guide to deploying a free, self-hosted hotel chatbot on your own server. Deploy an open source hotel chatbot in under 30 minutes — no coding required.',
    date: '2026-02-16',
    readTime: '12 min read',
    category: 'Tutorials',
    image: '/blog/open-source-hotel-chatbot-setup.jpeg',
    author: authors.arash
  },
  {
    slug: 'chatbot-for-hotels',
    title: 'Chatbot for Hotels: Complete Implementation Guide',
    description: 'Step-by-step guide to implementing a hotel chatbot — from defining goals to measuring results. Learn how to choose, deploy, and optimize AI guest communication.',
    date: '2026-02-14',
    readTime: '14 min read',
    category: 'Guides',
    image: '/blog/chatbot-for-hotels.jpeg',
    author: authors.arash
  },
  {
    slug: 'free-hotel-chatbot-solutions',
    title: 'Free Hotel Chatbot Solutions in 2026',
    description: 'Compare the best free hotel chatbot options. Learn which solutions actually work without breaking your budget.',
    date: '2026-02-09',
    readTime: '8 min read',
    category: 'Guides',
    image: '/blog/free-hotel-chatbot-solutions.jpeg',
    author: authors.arash
  },
  {
    slug: 'what-is-hotel-chatbot',
    title: 'What is a Hotel Chatbot? Complete Guide',
    description: 'Everything you need to know about hotel chatbots — how they work, what they cost, and how to choose the right one.',
    date: '2026-02-08',
    readTime: '12 min read',
    category: 'Education',
    image: '/blog/what-is-hotel-chatbot.jpeg',
    author: authors.arash
  },
  {
    slug: 'hotel-whatsapp-automation',
    title: 'How to Set Up WhatsApp for Hotels',
    description: 'Step-by-step guide to automating your hotel guest communication on WhatsApp Business.',
    date: '2026-02-07',
    readTime: '10 min read',
    category: 'Tutorials',
    image: '/blog/hotel-whatsapp-automation.jpeg',
    author: authors.arash
  }
]

export function getPublishedPosts(): BlogPost[] {
  const today = new Date().toISOString().split('T')[0]
  return blogPosts.filter(post => post.date <= today)
}

export function getPost(slug: string): BlogPost | undefined {
  return blogPosts.find(post => post.slug === slug)
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}
