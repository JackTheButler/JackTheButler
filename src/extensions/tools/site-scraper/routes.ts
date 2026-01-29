/**
 * Site Scraper API Routes
 *
 * API endpoints for the site scraper tool.
 *
 * @module extensions/tools/site-scraper/routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '@/gateway/middleware/index.js';
import { scrapeUrl, scrapeUrls } from './scraper.js';
import { parseHtml } from './parser.js';
import { processContent } from './processor.js';
import type { ProcessedEntry } from './processor.js';
import { logger } from '@/utils/logger.js';

// Define custom variables type for Hono context
type Variables = {
  validatedBody: unknown;
  userId: string;
};

const router = new Hono<{ Variables: Variables }>();

/**
 * Fetch URLs schema
 */
const fetchSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(10),
  options: z
    .object({
      selector: z.string().optional(),
      excludeSelectors: z.array(z.string()).optional(),
      timeout: z.number().min(1000).max(30000).optional(),
    })
    .optional(),
});

/**
 * Process content schema
 */
const processSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      html: z.string(),
      status: z.enum(['success', 'error']),
    })
  ),
  options: z
    .object({
      hotelName: z.string().optional(),
    })
    .optional(),
});

/**
 * Import entries schema
 */
const importSchema = z.object({
  entries: z.array(
    z.object({
      category: z.string(),
      title: z.string(),
      content: z.string(),
      keywords: z.array(z.string()),
      priority: z.number().min(1).max(10),
      sourceUrl: z.string(),
    })
  ),
  options: z
    .object({
      skipDuplicates: z.boolean().optional(),
      updateExisting: z.boolean().optional(),
    })
    .optional(),
});

/**
 * POST /api/v1/tools/site-scraper/fetch
 * Fetch content from one or more URLs
 */
router.post('/fetch', validateBody(fetchSchema), async (c) => {
  const { urls, options } = c.get('validatedBody') as z.infer<typeof fetchSchema>;

  logger.info({ urlCount: urls.length }, 'Site scraper fetch request');

  const results = await scrapeUrls(urls, options || {});

  return c.json({
    results: results.map((r) => ({
      url: r.url,
      title: r.title,
      status: r.status,
      error: r.error,
      statusCode: r.statusCode,
      fetchedAt: r.fetchedAt,
      contentLength: r.html.length,
      // Don't include full HTML in response - too large
    })),
    summary: {
      total: results.length,
      success: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'error').length,
    },
  });
});

/**
 * POST /api/v1/tools/site-scraper/parse
 * Parse HTML content from previously fetched URLs
 */
router.post('/parse', validateBody(fetchSchema), async (c) => {
  const { urls, options } = c.get('validatedBody') as z.infer<typeof fetchSchema>;

  logger.info({ urlCount: urls.length }, 'Site scraper parse request');

  // Fetch URLs
  const fetchResults = await scrapeUrls(urls, options || {});

  // Parse each successful result
  const parseResults = fetchResults.map((result) => {
    if (result.status === 'error') {
      return {
        url: result.url,
        status: 'error' as const,
        error: result.error,
        sections: [],
      };
    }

    try {
      const parsed = parseHtml(result.html, {
        selector: options?.selector,
        excludeSelectors: options?.excludeSelectors,
      });

      return {
        url: result.url,
        status: 'success' as const,
        title: parsed.title || result.title,
        metadata: parsed.metadata,
        sections: parsed.sections,
        sectionCount: parsed.sections.length,
      };
    } catch (error) {
      return {
        url: result.url,
        status: 'error' as const,
        error: error instanceof Error ? error.message : 'Parse error',
        sections: [],
      };
    }
  });

  return c.json({
    results: parseResults,
    summary: {
      total: parseResults.length,
      success: parseResults.filter((r) => r.status === 'success').length,
      failed: parseResults.filter((r) => r.status === 'error').length,
      totalSections: parseResults.reduce((sum, r) => sum + (r.sectionCount || 0), 0),
    },
  });
});

/**
 * POST /api/v1/tools/site-scraper/process
 * Process parsed content with AI categorization
 */
router.post('/process', validateBody(processSchema), async (c) => {
  const { results, options } = c.get('validatedBody') as z.infer<typeof processSchema>;

  logger.info({ resultCount: results.length }, 'Site scraper process request');

  const allEntries: ProcessedEntry[] = [];

  for (const result of results) {
    if (result.status !== 'success' || !result.html) {
      continue;
    }

    try {
      // Parse HTML
      const parsed = parseHtml(result.html);

      // Process with AI
      const entries = await processContent(parsed.sections, {
        sourceUrl: result.url,
        hotelName: options?.hotelName,
        metadata: parsed.metadata,
      });

      allEntries.push(...entries);
    } catch (error) {
      logger.error({ url: result.url, error }, 'Failed to process result');
    }
  }

  // Deduplicate by title similarity
  const deduplicated = deduplicateEntries(allEntries);

  return c.json({
    entries: deduplicated,
    summary: {
      total: deduplicated.length,
      byCategory: countByCategory(deduplicated),
      duplicatesRemoved: allEntries.length - deduplicated.length,
    },
  });
});

/**
 * POST /api/v1/tools/site-scraper/import
 * Import processed entries to knowledge base
 */
router.post('/import', validateBody(importSchema), async (c) => {
  const { entries, options } = c.get('validatedBody') as z.infer<typeof importSchema>;

  logger.info({ entryCount: entries.length }, 'Site scraper import request');

  // Import to knowledge base
  const result = await importToKnowledgeBase(entries, options || {});

  return c.json({
    imported: result.imported,
    skipped: result.skipped,
    updated: result.updated,
    errors: result.errors,
  });
});

/**
 * GET /api/v1/tools/site-scraper/preview
 * Quick preview of what can be scraped from a URL
 */
router.get('/preview', async (c) => {
  const url = c.req.query('url');

  if (!url) {
    return c.json({ error: 'URL parameter is required' }, 400);
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  logger.info({ url }, 'Site scraper preview request');

  // Fetch and parse
  const fetchResult = await scrapeUrl({ url, timeout: 15000 });

  if (fetchResult.status === 'error') {
    return c.json({
      url,
      status: 'error',
      error: fetchResult.error,
    });
  }

  const parsed = parseHtml(fetchResult.html);

  return c.json({
    url,
    status: 'success',
    title: parsed.title,
    metadata: parsed.metadata,
    preview: {
      sectionCount: parsed.sections.length,
      sectionTypes: countSectionTypes(parsed.sections),
      estimatedEntries: parsed.sections.length,
      sampleSections: parsed.sections.slice(0, 3).map((s) => ({
        type: s.type,
        heading: s.heading,
        contentPreview: (s.content || '').substring(0, 200),
      })),
    },
  });
});

/**
 * Deduplicate entries by title similarity
 */
function deduplicateEntries(entries: ProcessedEntry[]): ProcessedEntry[] {
  const seen = new Map<string, ProcessedEntry>();

  for (const entry of entries) {
    const normalizedTitle = entry.title.toLowerCase().replace(/\s+/g, ' ').trim();

    // Check for exact or near match
    let isDuplicate = false;
    for (const [existingTitle] of seen) {
      if (
        existingTitle === normalizedTitle ||
        levenshteinSimilarity(existingTitle, normalizedTitle) > 0.8
      ) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.set(normalizedTitle, entry);
    }
  }

  return Array.from(seen.values());
}

/**
 * Count entries by category
 */
function countByCategory(entries: ProcessedEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    counts[entry.category] = (counts[entry.category] || 0) + 1;
  }
  return counts;
}

/**
 * Count sections by type
 */
function countSectionTypes(sections: Array<{ type: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const section of sections) {
    counts[section.type] = (counts[section.type] || 0) + 1;
  }
  return counts;
}

/**
 * Calculate Levenshtein similarity between two strings
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = matrix[i];
      const prevRow = matrix[i - 1];
      if (row && prevRow) {
        row[j] = Math.min(
          (prevRow[j] ?? 0) + 1,
          (row[j - 1] ?? 0) + 1,
          (prevRow[j - 1] ?? 0) + cost
        );
      }
    }
  }

  const lastRow = matrix[a.length];
  const distance = lastRow?.[b.length] ?? 0;
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength;
}

/**
 * Import entries to knowledge base
 */
async function importToKnowledgeBase(
  entries: Array<{
    category: string;
    title: string;
    content: string;
    keywords: string[];
    priority: number;
    sourceUrl: string;
  }>,
  options: { skipDuplicates?: boolean | undefined; updateExisting?: boolean | undefined }
): Promise<{
  imported: number;
  skipped: number;
  updated: number;
  errors: string[];
}> {
  // TODO: Implement actual database import
  // This is a placeholder that will be implemented when we have the knowledge service

  const { skipDuplicates = true, updateExisting = false } = options;

  logger.info({ entryCount: entries.length, skipDuplicates, updateExisting }, 'Importing to knowledge base');

  // For now, return mock success
  // In the real implementation:
  // 1. Check for existing entries by title/content hash
  // 2. Skip/update as configured
  // 3. Insert new entries
  // 4. Generate embeddings for vector search

  return {
    imported: entries.length,
    skipped: 0,
    updated: 0,
    errors: [],
  };
}

export { router as siteScraperRoutes };
