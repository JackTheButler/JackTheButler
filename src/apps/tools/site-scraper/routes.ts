/**
 * Site Scraper API Routes
 *
 * API endpoints for the site scraper tool.
 *
 * @module extensions/tools/site-scraper/routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { validateBody } from '@/gateway/middleware/index.js';
import { scrapeUrls } from './scraper.js';
import { parseHtml } from './parser.js';
import { processContent } from './processor.js';
import { htmlToCleanText } from './html-to-text.js';
import { extractContentWithAI } from './ai-parser.js';
import type { AIExtractedEntry } from './ai-parser.js';
import { generateQAPairs } from './qa-generator.js';
import { deduplicateEntries as semanticDedup } from './deduplicator.js';
import { logger } from '@/utils/logger.js';
import { db, knowledgeBase, knowledgeEmbeddings } from '@/db/index.js';
import { generateId } from '@/utils/id.js';
import { getAppRegistry } from '@/apps/index.js';
import type { AIProvider } from '@/core/interfaces/ai.js';

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
  qaPairs: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
      entryIndex: z.number(),
    })
  ).optional(),
  options: z
    .object({
      skipDuplicates: z.boolean().optional(),
      updateExisting: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Q&A generation schema
 */
const qaSchema = z.object({
  entries: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
      category: z.string(),
      keywords: z.array(z.string()),
      confidence: z.number(),
    })
  ),
});

/**
 * POST /api/v1/tools/site-scraper/parse
 * Parse HTML content from previously fetched URLs (AI-powered)
 */
router.post('/parse', validateBody(fetchSchema), async (c) => {
  // Check if embedding provider is available before starting
  const registry = getAppRegistry();
  const embeddingProvider = registry.getEmbeddingProvider();

  if (!embeddingProvider) {
    return c.json(
      {
        error: {
          message: 'No embedding provider configured. Please enable Local AI or configure OpenAI/Anthropic in Settings > Extensions > AI before importing content.',
          code: 'NO_EMBEDDING_PROVIDER',
        },
      },
      400
    );
  }

  const { urls, options } = c.get('validatedBody') as z.infer<typeof fetchSchema>;

  logger.info({ urlCount: urls.length }, 'Site scraper parse request (AI-powered)');

  // Fetch URLs
  const fetchResults = await scrapeUrls(urls, options || {});

  // Parse each successful result
  const parseResults = await Promise.all(
    fetchResults.map(async (result) => {
      if (result.status === 'error') {
        return {
          url: result.url,
          status: 'error' as const,
          error: result.error,
          entries: [] as AIExtractedEntry[],
        };
      }

      try {
        // Try AI-powered extraction first
        const cleanText = htmlToCleanText(result.html);
        const aiEntries = await extractContentWithAI(cleanText, {
          hotelName: options?.hotelName,
          url: result.url,
        });

        if (aiEntries && aiEntries.length > 0) {
          return {
            url: result.url,
            status: 'success' as const,
            title: cleanText.title || result.title,
            entries: aiEntries,
            entryCount: aiEntries.length,
            method: 'ai' as const,
          };
        }

        // Fallback to CSS-selector parsing + AI categorization
        logger.info({ url: result.url }, 'AI extraction returned no results, falling back to CSS parsing');
        const parsed = parseHtml(result.html, {
          selector: options?.selector,
          excludeSelectors: options?.excludeSelectors,
        });

        const processed = await processContent(parsed.sections, {
          sourceUrl: result.url,
          hotelName: options?.hotelName,
          metadata: parsed.metadata,
        });

        const fallbackEntries: AIExtractedEntry[] = processed.map((p) => ({
          title: p.title,
          content: p.content,
          category: p.category,
          keywords: p.keywords,
          confidence: p.confidence,
        }));

        return {
          url: result.url,
          status: 'success' as const,
          title: parsed.title || result.title,
          entries: fallbackEntries,
          entryCount: fallbackEntries.length,
          method: 'fallback' as const,
        };
      } catch (error) {
        return {
          url: result.url,
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Parse error',
          entries: [] as AIExtractedEntry[],
        };
      }
    })
  );

  // Collect all entries for deduplication
  const allEntries = parseResults.flatMap((r) => r.entries || []);
  const dedupResult = await semanticDedup(allEntries);

  return c.json({
    results: parseResults,
    entries: dedupResult.entries,
    duplicates: dedupResult.duplicates,
    summary: {
      total: parseResults.length,
      success: parseResults.filter((r) => r.status === 'success').length,
      failed: parseResults.filter((r) => r.status === 'error').length,
      totalEntries: allEntries.length,
    },
  });
});

/**
 * POST /api/v1/tools/site-scraper/generate-qa
 * Generate Q&A pairs from extracted entries
 */
router.post('/generate-qa', validateBody(qaSchema), async (c) => {
  const { entries } = c.get('validatedBody') as z.infer<typeof qaSchema>;

  logger.info({ entryCount: entries.length }, 'Generating Q&A pairs');

  const aiEntries: AIExtractedEntry[] = entries.map((e) => ({
    title: e.title,
    content: e.content,
    category: e.category as AIExtractedEntry['category'],
    keywords: e.keywords,
    confidence: e.confidence,
  }));

  const qaPairs = await generateQAPairs(aiEntries);

  return c.json({ qaPairs });
});

/**
 * POST /api/v1/tools/site-scraper/import
 * Import processed entries to knowledge base
 */
router.post('/import', validateBody(importSchema), async (c) => {
  // Check if embedding provider is available
  const registry = getAppRegistry();
  const embeddingProvider = registry.getEmbeddingProvider();

  if (!embeddingProvider) {
    return c.json(
      {
        error: {
          message: 'No embedding provider configured. Please enable Local AI or configure OpenAI/Anthropic in Settings > Extensions > AI.',
          code: 'NO_EMBEDDING_PROVIDER',
        },
      },
      400
    );
  }

  const { entries, qaPairs, options } = c.get('validatedBody') as z.infer<typeof importSchema>;

  logger.info({ entryCount: entries.length, qaPairCount: qaPairs?.length ?? 0 }, 'Site scraper import request');

  // Import main entries
  const result = await importToKnowledgeBase(entries, options || {}, embeddingProvider);

  // Import Q&A pairs as additional faq entries
  if (qaPairs && qaPairs.length > 0) {
    const qaEntries = qaPairs.map((qa) => ({
      category: 'faq',
      title: qa.question,
      content: `Q: ${qa.question}\nA: ${qa.answer}`,
      keywords: [],
      priority: 8,
      sourceUrl: entries[qa.entryIndex]?.sourceUrl || '',
    }));

    const qaResult = await importToKnowledgeBase(qaEntries, options || {}, embeddingProvider);
    result.imported += qaResult.imported;
    result.skipped += qaResult.skipped;
    result.errors.push(...qaResult.errors);
  }

  return c.json({
    imported: result.imported,
    skipped: result.skipped,
    updated: result.updated,
    errors: result.errors,
  });
});

/**
 * GET /api/v1/tools/site-scraper/sources
 * List previously imported source URLs with entry counts
 */
router.get('/sources', async (c) => {
  const sources = await db
    .select({
      url: knowledgeBase.sourceUrl,
      entryCount: sql<number>`count(*)`,
      lastImportedAt: sql<string>`max(${knowledgeBase.createdAt})`,
    })
    .from(knowledgeBase)
    .where(
      sql`${knowledgeBase.sourceUrl} IS NOT NULL AND ${knowledgeBase.status} = 'active'`
    )
    .groupBy(knowledgeBase.sourceUrl)
    .orderBy(sql`max(${knowledgeBase.createdAt}) DESC`)
    .all();

  return c.json({
    sources: sources.map((s) => ({
      url: s.url!,
      entryCount: s.entryCount,
      lastImportedAt: s.lastImportedAt,
    })),
  });
});

/**
 * Import entries to knowledge base with embeddings
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
  options: { skipDuplicates?: boolean | undefined; updateExisting?: boolean | undefined },
  embeddingProvider: AIProvider
): Promise<{
  imported: number;
  skipped: number;
  updated: number;
  errors: string[];
}> {
  const { skipDuplicates = true, updateExisting = false } = options;

  logger.info({ entryCount: entries.length, skipDuplicates, updateExisting }, 'Importing to knowledge base');

  let imported = 0;
  let skipped = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    try {
      // Check for existing entry with same title
      const existing = await db
        .select()
        .from(knowledgeBase)
        .where(eq(knowledgeBase.title, entry.title))
        .get();

      if (existing) {
        if (skipDuplicates && !updateExisting) {
          skipped++;
          continue;
        }

        if (updateExisting) {
          await db
            .update(knowledgeBase)
            .set({
              category: entry.category,
              content: entry.content,
              keywords: JSON.stringify(entry.keywords),
              priority: entry.priority,
              sourceUrl: entry.sourceUrl || null,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(knowledgeBase.id, existing.id))
            .run();

          // Regenerate embedding for updated content
          await generateAndStoreEmbedding(existing.id, entry.content, embeddingProvider);

          updated++;
          continue;
        }
      }

      // Insert new entry
      const id = generateId('knowledge');
      const now = new Date().toISOString();

      await db
        .insert(knowledgeBase)
        .values({
          id,
          category: entry.category,
          title: entry.title,
          content: entry.content,
          keywords: JSON.stringify(entry.keywords),
          priority: entry.priority,
          status: 'active',
          sourceUrl: entry.sourceUrl || null,
          sourceEntryId: id,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Generate embedding for new entry
      await generateAndStoreEmbedding(id, entry.content, embeddingProvider);

      imported++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Failed to import "${entry.title}": ${message}`);
      logger.error({ entry: entry.title, error: message }, 'Failed to import entry');
    }
  }

  logger.info({ imported, skipped, updated, errorCount: errors.length }, 'Knowledge base import complete');

  return {
    imported,
    skipped,
    updated,
    errors,
  };
}

/**
 * Generate and store embedding for a knowledge base entry
 */
async function generateAndStoreEmbedding(
  id: string,
  content: string,
  embeddingProvider: AIProvider
): Promise<void> {
  try {
    const response = await embeddingProvider.embed({ text: content });

    // Delete existing embedding if any
    await db.delete(knowledgeEmbeddings).where(eq(knowledgeEmbeddings.id, id)).run();

    // Store new embedding
    await db
      .insert(knowledgeEmbeddings)
      .values({
        id,
        embedding: JSON.stringify(response.embedding),
        model: embeddingProvider.name,
        dimensions: response.embedding.length,
      })
      .run();

    logger.debug({ id, dimensions: response.embedding.length }, 'Embedding generated');
  } catch (error) {
    logger.error({ id, error }, 'Failed to generate embedding');
    throw error;
  }
}

export { router as siteScraperRoutes };
