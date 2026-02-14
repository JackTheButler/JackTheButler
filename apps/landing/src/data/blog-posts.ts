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
    slug: 'chatbot-for-hotels',
    title: 'Chatbot for Hotels: Complete Implementation Guide',
    description: 'Step-by-step guide to implementing a hotel chatbot — from defining goals to measuring results. Learn how to choose, deploy, and optimize AI guest communication.',
    date: '2026-02-14',
    readTime: '14 min read',
    category: 'Guides',
    image: '/blog/chatbot-for-hotels.jpg',
    author: authors.arash
  },
  {
    slug: 'free-hotel-chatbot-solutions',
    title: 'Free Hotel Chatbot Solutions in 2026',
    description: 'Compare the best free hotel chatbot options. Learn which solutions actually work without breaking your budget.',
    date: '2026-02-09',
    readTime: '8 min read',
    category: 'Guides',
    image: '/blog/free-chatbots.jpg',
    author: authors.arash
  },
  {
    slug: 'what-is-hotel-chatbot',
    title: 'What is a Hotel Chatbot? Complete Guide',
    description: 'Everything you need to know about hotel chatbots — how they work, what they cost, and how to choose the right one.',
    date: '2026-02-08',
    readTime: '12 min read',
    category: 'Education',
    image: '/blog/hotel-chatbot-guide.jpg',
    author: authors.arash
  },
  {
    slug: 'hotel-whatsapp-automation',
    title: 'How to Set Up WhatsApp for Hotels',
    description: 'Step-by-step guide to automating your hotel guest communication on WhatsApp Business.',
    date: '2026-02-07',
    readTime: '10 min read',
    category: 'Tutorials',
    image: '/blog/whatsapp-hotels.jpg',
    author: authors.arash
  }
]

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
