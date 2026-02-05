/**
 * Site Scraper - AI Content Extraction
 *
 * Replaces CSS-selector parsing as primary extraction path.
 * Takes clean text from html-to-text and uses AI to extract + categorize
 * content in a single step.
 *
 * Falls back to parser.ts + processor.ts on AI failure.
 *
 * @module extensions/tools/site-scraper/ai-parser
 */

import { getAppRegistry } from '../../registry.js';
import { logger } from '@/utils/logger.js';
import type { KnowledgeCategory } from './processor.js';
import type { CleanTextResult } from './html-to-text.js';

/**
 * An entry extracted by AI
 */
export interface AIExtractedEntry {
  title: string;
  content: string;
  category: KnowledgeCategory;
  keywords: string[];
  confidence: number;
}

/**
 * Context for AI extraction
 */
export interface AIExtractionContext {
  hotelName?: string | undefined;
  url: string;
}

const MAX_WORDS_PER_CHUNK = 3000;

/**
 * Extract and categorize content using AI in one step.
 * Returns null on failure so the caller can fall back to the old path.
 */
export async function extractContentWithAI(
  cleanText: CleanTextResult,
  context: AIExtractionContext
): Promise<AIExtractedEntry[] | null> {
  const registry = getAppRegistry();
  const aiProvider = registry.getActiveAIProvider();

  if (!aiProvider) {
    logger.warn('No AI provider available for content extraction');
    return null;
  }

  try {
    const chunks = chunkText(cleanText.text, MAX_WORDS_PER_CHUNK);
    const allEntries: AIExtractedEntry[] = [];

    for (const chunk of chunks) {
      const entries = await extractChunk(chunk, context, aiProvider);
      allEntries.push(...entries);
    }

    logger.info(
      { entryCount: allEntries.length, wordCount: cleanText.wordCount },
      'AI content extraction complete'
    );

    return allEntries;
  } catch (error) {
    logger.error({ error }, 'AI content extraction failed');
    return null;
  }
}

/**
 * Extract entries from a single text chunk
 */
async function extractChunk(
  text: string,
  context: AIExtractionContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aiProvider: any
): Promise<AIExtractedEntry[]> {
  const prompt = buildExtractionPrompt(text, context);

  const response = await aiProvider.complete({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4000,
    temperature: 0.3,
  });

  const jsonMatch = response.content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    logger.warn('Failed to parse AI extraction response');
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]) as Array<{
    title: string;
    content: string;
    category: KnowledgeCategory;
    keywords: string[];
    confidence: number;
  }>;

  return parsed
    .filter((e) => e.title && e.content && e.content.length > 20)
    .map((e) => ({
      title: e.title.substring(0, 100),
      content: e.content,
      category: e.category || 'other',
      keywords: (e.keywords || []).slice(0, 8),
      confidence: Math.min(1, Math.max(0, e.confidence || 0.7)),
    }));
}

/**
 * Build the extraction prompt
 */
function buildExtractionPrompt(text: string, context: AIExtractionContext): string {
  return `You are extracting structured knowledge base entries from a hotel website${context.hotelName ? ` for "${context.hotelName}"` : ''}.
URL: ${context.url}

For each distinct topic/section in the text below, create a knowledge base entry with:
1. **title**: Concise, descriptive (max 60 chars). For Q&A, rephrase as a statement.
2. **content**: Clean, well-formatted content. Preserve important details.
3. **category**: One of: faq, policy, amenity, service, dining, room_type, local_info, contact, other
4. **keywords**: 5-8 lowercase search keywords
5. **confidence**: 0-1 how confident you are in the categorization

Category guidelines:
- faq: Direct questions and answers
- policy: Check-in/out, cancellation, pet policy, dress code, etc.
- amenity: Pool, gym, spa, parking, WiFi, etc.
- service: Room service, concierge, laundry, etc.
- dining: Restaurants, bars, breakfast, menus, hours
- room_type: Room descriptions, features, views
- local_info: Nearby attractions, transportation, directions
- contact: Phone, email, address, social media
- other: Anything that doesn't fit above

Rules:
- Split long sections into logical entries (one topic per entry)
- Merge very short related snippets into coherent entries
- Skip navigation text, cookie notices, and boilerplate
- Each entry should be self-contained and useful for answering guest questions

Website text:
${text}

Return a JSON array (no markdown, just the array) with objects containing: title, content, category, keywords, confidence.`;
}

/**
 * Split text into chunks at approximately maxWords word boundaries
 */
function chunkText(text: string, maxWords: number): string[] {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    let end = Math.min(start + maxWords, words.length);

    // Try to break at a heading marker or double newline
    if (end < words.length) {
      const searchStart = Math.max(start + Math.floor(maxWords * 0.8), start);
      const segment = words.slice(searchStart, end).join(' ');
      const breakMatch = segment.match(/\n##?\s/);
      if (breakMatch && breakMatch.index !== undefined) {
        const breakWordOffset = segment.substring(0, breakMatch.index).split(/\s+/).length;
        end = searchStart + breakWordOffset;
      }
    }

    chunks.push(words.slice(start, end).join(' '));
    start = end;
  }

  return chunks;
}
