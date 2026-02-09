import type { APIRoute } from 'astro'
import { blogPosts, authors } from '@/data/blog-posts'

const site = 'https://jackthebutler.com'

export const GET: APIRoute = () => {
  const today = new Date().toISOString().split('T')[0]

  const staticPages = [
    { url: '/', changefreq: 'weekly', priority: '1.0' },
    { url: '/hotel-chatbot/', changefreq: 'monthly', priority: '0.9' },
    { url: '/blog/', changefreq: 'weekly', priority: '0.8' },
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

  const allPages = [...staticPages, ...blogPages, ...authorPages]

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
