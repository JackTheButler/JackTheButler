/**
 * Site Scraper - Q&A Generator
 *
 * Uses AI to generate guest questions from extracted content entries.
 *
 * @module extensions/tools/site-scraper/qa-generator
 */

import { getAppRegistry } from '../../registry.js';
import { logger } from '@/utils/logger.js';
import type { AIExtractedEntry } from './ai-parser.js';

/**
 * A generated Q&A pair
 */
export interface GeneratedQA {
  question: string;
  answer: string;
  entryIndex: number;
}

/**
 * Generate guest Q&A pairs from extracted entries.
 * Returns empty array on failure (non-blocking).
 */
export async function generateQAPairs(entries: AIExtractedEntry[]): Promise<GeneratedQA[]> {
  const registry = getAppRegistry();
  const aiProvider = registry.getActiveAIProvider();

  if (!aiProvider) {
    logger.warn('No AI provider available for Q&A generation');
    return [];
  }

  const batches = batchEntries(entries, 5);
  const allQA: GeneratedQA[] = [];

  for (const batch of batches) {
    try {
      const batchQA = await generateBatch(batch, aiProvider);
      allQA.push(...batchQA);
    } catch (error) {
      logger.error({ error }, 'Q&A generation batch failed, skipping');
    }
  }

  logger.info({ entryCount: entries.length, qaCount: allQA.length }, 'Q&A generation complete');
  return allQA;
}

/**
 * Generate Q&A for a batch of entries
 */
async function generateBatch(
  batch: { entry: AIExtractedEntry; originalIndex: number }[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aiProvider: any
): Promise<GeneratedQA[]> {
  const entrySummaries = batch.map((b) => ({
    index: b.originalIndex,
    title: b.entry.title,
    content: b.entry.content.substring(0, 400),
    category: b.entry.category,
  }));

  const prompt = `You are generating guest questions for a hotel knowledge base.

For each entry below, generate 2-3 realistic questions a hotel guest might ask that this entry answers. Keep questions natural and conversational.

Entries:
${JSON.stringify(entrySummaries, null, 2)}

Return a JSON array (no markdown, just the array) with objects:
{ "entryIndex": <number>, "question": "<guest question>", "answer": "<concise answer from the entry>" }`;

  const response = await aiProvider.complete({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2000,
    temperature: 0.5,
  });

  const jsonMatch = response.content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    logger.warn('Failed to parse Q&A AI response');
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]) as Array<{
    entryIndex: number;
    question: string;
    answer: string;
  }>;

  return parsed
    .filter((qa) => qa.question && qa.answer)
    .map((qa) => ({
      question: qa.question,
      answer: qa.answer,
      entryIndex: qa.entryIndex,
    }));
}

/**
 * Batch entries with their original indices preserved
 */
function batchEntries(
  entries: AIExtractedEntry[],
  batchSize: number
): { entry: AIExtractedEntry; originalIndex: number }[][] {
  const indexed = entries.map((entry, i) => ({ entry, originalIndex: i }));
  const batches: { entry: AIExtractedEntry; originalIndex: number }[][] = [];
  for (let i = 0; i < indexed.length; i += batchSize) {
    batches.push(indexed.slice(i, i + batchSize));
  }
  return batches;
}
