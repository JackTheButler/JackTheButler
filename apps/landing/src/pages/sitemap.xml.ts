import type { APIRoute } from 'astro'
import { blogPosts, authors } from '../data/blog-posts'

const site = 'https://jackthebutler.com'

export const GET: APIRoute = () => {
  const today = new Date().toISOString().split('T')[0]

  const staticPages = [
    { url: '/', changefreq: 'weekly', priority: '1.0' },
    { url: '/hotel-chatbot/', changefreq: 'monthly', priority: '0.9' },
    { url: '/airbnb-chatbot/', changefreq: 'monthly', priority: '0.9' },
    { url: '/hostel-chatbot/', changefreq: 'monthly', priority: '0.9' },
    { url: '/blog/', changefreq: 'weekly', priority: '0.8' },
    { url: '/docs/', changefreq: 'weekly', priority: '0.8' },
  ]

  const docsPages = [
    // Getting Started
    { url: '/docs/getting-started/introduction/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/getting-started/quick-start/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/getting-started/setup-wizard/', changefreq: 'monthly', priority: '0.7' },
    // Installation
    { url: '/docs/installation/cloud/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/installation/docker/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/installation/source/', changefreq: 'monthly', priority: '0.7' },
    // Features
    { url: '/docs/features/ai-responses/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/features/knowledge-base/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/features/channels/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/features/tasks/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/features/automations/', changefreq: 'monthly', priority: '0.7' },
    // Configuration
    { url: '/docs/configuration/ai-providers/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/configuration/whatsapp/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/configuration/sms/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/configuration/email/', changefreq: 'monthly', priority: '0.7' },
    // API Reference
    { url: '/docs/api/authentication/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/api/rest/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/api/webhooks/', changefreq: 'monthly', priority: '0.7' },
    // Help
    { url: '/docs/help/faq/', changefreq: 'monthly', priority: '0.7' },
    { url: '/docs/help/troubleshooting/', changefreq: 'monthly', priority: '0.7' },
  ]

  const blogPages = blogPosts.map(post => ({
    url: `/blog/${post.slug}/`,
    changefreq: 'monthly',
    priority: '0.7',
    lastmod: post.date,
  }))

  const authorPages = Object.values(authors).map(author => ({
    url: `/blog/author/${author.slug}/`,
    changefreq: 'monthly',
    priority: '0.6',
  }))

  const allPages = [...staticPages, ...docsPages, ...blogPages, ...authorPages]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(page => `  <url>
    <loc>${site}${page.url}</loc>
    <lastmod>${page.lastmod || today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  })
}
