/**
 * Site Scraper - AI Content Processor
 *
 * Uses AI to categorize, clean, and structure scraped content.
 *
 * @module extensions/tools/site-scraper/processor
 */

import { getAppRegistry } from '../../registry.js';
import { logger } from '@/utils/logger.js';
import type { ContentSection, PageMetadata } from './parser.js';

/**
 * Knowledge base categories
 */
export type KnowledgeCategory =
  | 'faq'
  | 'policy'
  | 'amenity'
  | 'service'
  | 'dining'
  | 'room_type'
  | 'local_info'
  | 'contact'
  | 'other';

/**
 * Processed entry ready for import
 */
export interface ProcessedEntry {
  /** Auto-assigned category */
  category: KnowledgeCategory;
  /** Cleaned title */
  title: string;
  /** Cleaned content */
  content: string;
  /** Generated keywords for search */
  keywords: string[];
  /** Priority score (1-10) */
  priority: number;
  /** Source URL */
  sourceUrl: string;
  /** AI confidence score (0-1) */
  confidence: number;
  /** Original section type */
  originalType: ContentSection['type'];
}

/**
 * Processing context
 */
export interface ProcessContext {
  hotelName?: string | undefined;
  sourceUrl: string;
  metadata?: PageMetadata | undefined;
}

/**
 * Process extracted content sections with AI
 */
export async function processContent(
  sections: ContentSection[],
  context: ProcessContext
): Promise<ProcessedEntry[]> {
  const { sourceUrl, hotelName } = context;

  logger.info({ sectionCount: sections.length, sourceUrl, hotelName }, 'Processing content with AI');

  // Get AI provider
  const registry = getAppRegistry();
  const aiProvider = registry.getActiveAIProvider();

  if (!aiProvider) {
    logger.warn('No active AI provider, using rule-based processing');
    return processWithRules(sections, context);
  }

  // Batch sections for efficient processing
  const batches = batchSections(sections, 5);
  const results: ProcessedEntry[] = [];

  for (const batch of batches) {
    const batchResults = await processBatchWithAI(batch, context, aiProvider);
    results.push(...batchResults);
  }

  logger.info({ resultCount: results.length }, 'Content processing complete');

  return results;
}

/**
 * Process a batch of sections with AI
 */
async function processBatchWithAI(
  sections: ContentSection[],
  context: ProcessContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aiProvider: any
): Promise<ProcessedEntry[]> {
  const { sourceUrl, hotelName } = context;

  const prompt = buildProcessingPrompt(sections, hotelName);

  try {
    const response = await aiProvider.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
      temperature: 0.3, // Lower temperature for more consistent categorization
    });

    const content = response.content;

    // Parse JSON response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn('Failed to parse AI response, using rule-based fallback');
      return processWithRules(sections, context);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      category: KnowledgeCategory;
      title: string;
      content: string;
      keywords: string[];
      priority: number;
      confidence: number;
    }>;

    return parsed.map((entry, i) => ({
      category: entry.category || 'other',
      title: entry.title || sections[entry.index]?.heading || `Entry ${i + 1}`,
      content: entry.content || sections[entry.index]?.content || '',
      keywords: entry.keywords || [],
      priority: Math.min(10, Math.max(1, entry.priority || 5)),
      sourceUrl,
      confidence: Math.min(1, Math.max(0, entry.confidence || 0.7)),
      originalType: sections[entry.index]?.type || 'paragraph',
    }));
  } catch (error) {
    logger.error({ error }, 'AI processing failed');
    return processWithRules(sections, context);
  }
}

/**
 * Build the AI prompt for processing
 */
function buildProcessingPrompt(sections: ContentSection[], hotelName?: string): string {
  const sectionsJson = sections.map((s, i) => ({
    index: i,
    type: s.type,
    heading: s.heading,
    content: s.content?.substring(0, 500), // Truncate for prompt
    question: s.question,
    answer: s.answer,
  }));

  return `You are processing hotel website content for a knowledge base${hotelName ? ` for "${hotelName}"` : ''}.

For each section, determine:
1. **category**: One of: faq, policy, amenity, service, dining, room_type, local_info, contact, other
2. **title**: Concise, descriptive title (max 60 chars). For FAQs, rephrase the question as a statement.
3. **content**: Clean, well-formatted content. For FAQs, include both Q and A clearly.
4. **keywords**: 5-8 relevant search keywords (lowercase)
5. **priority**: 1-10 (10 = most important for guest queries)
6. **confidence**: 0-1 how confident you are in the categorization

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

Sections to process:
${JSON.stringify(sectionsJson, null, 2)}

Return a JSON array (no markdown, just the array) with objects containing: index, category, title, content, keywords, priority, confidence.`;
}

/**
 * Rule-based processing fallback (no AI)
 */
function processWithRules(
  sections: ContentSection[],
  context: ProcessContext
): ProcessedEntry[] {
  return sections.map((section, i) => {
    const category = categorizeByRules(section);
    const title = generateTitle(section, i);
    const keywords = generateKeywords(section);
    const priority = getPriorityForCategory(category);

    return {
      category,
      title,
      content: formatContent(section),
      keywords,
      priority,
      sourceUrl: context.sourceUrl,
      confidence: 0.5, // Lower confidence for rule-based
      originalType: section.type,
    };
  });
}

/**
 * Categorize content using simple rules
 */
function categorizeByRules(section: ContentSection): KnowledgeCategory {
  const content = (section.content + ' ' + (section.heading || '')).toLowerCase();

  // FAQ detection
  if (section.type === 'faq' || section.question) {
    return 'faq';
  }

  // Policy keywords
  const policyKeywords = [
    'policy',
    'check-in',
    'check-out',
    'checkout',
    'checkin',
    'cancellation',
    'cancel',
    'pet',
    'smoking',
    'dress code',
    'age',
    'children',
    'payment',
  ];
  if (policyKeywords.some((kw) => content.includes(kw))) {
    return 'policy';
  }

  // Amenity keywords
  const amenityKeywords = [
    'pool',
    'gym',
    'fitness',
    'spa',
    'parking',
    'wifi',
    'wi-fi',
    'internet',
    'laundry',
    'valet',
    'business center',
  ];
  if (amenityKeywords.some((kw) => content.includes(kw))) {
    return 'amenity';
  }

  // Dining keywords
  const diningKeywords = [
    'restaurant',
    'dining',
    'breakfast',
    'lunch',
    'dinner',
    'bar',
    'lounge',
    'menu',
    'room service',
    'cuisine',
  ];
  if (diningKeywords.some((kw) => content.includes(kw))) {
    return 'dining';
  }

  // Service keywords
  const serviceKeywords = [
    'service',
    'concierge',
    'housekeeping',
    'front desk',
    'reception',
    'shuttle',
    'transfer',
    'wake-up',
  ];
  if (serviceKeywords.some((kw) => content.includes(kw))) {
    return 'service';
  }

  // Room type keywords
  const roomKeywords = ['suite', 'room', 'bed', 'view', 'balcony', 'accommodation', 'guest room'];
  if (roomKeywords.some((kw) => content.includes(kw))) {
    return 'room_type';
  }

  // Local info keywords
  const localKeywords = [
    'nearby',
    'attraction',
    'location',
    'direction',
    'airport',
    'distance',
    'transportation',
  ];
  if (localKeywords.some((kw) => content.includes(kw))) {
    return 'local_info';
  }

  // Contact keywords
  const contactKeywords = ['contact', 'phone', 'email', 'address', 'reach us', 'call us'];
  if (contactKeywords.some((kw) => content.includes(kw))) {
    return 'contact';
  }

  return 'other';
}

/**
 * Generate a title for the section
 */
function generateTitle(section: ContentSection, index: number): string {
  // Use heading if available
  if (section.heading) {
    return section.heading.substring(0, 60);
  }

  // Use question for FAQ
  if (section.question) {
    return section.question.substring(0, 60);
  }

  // Generate from content
  const content = section.content;
  const firstSentence = content.split(/[.!?]/)[0]?.trim() ?? '';
  if (firstSentence.length > 10 && firstSentence.length < 60) {
    return firstSentence;
  }

  return `Content Section ${index + 1}`;
}

/**
 * Generate keywords from content
 */
function generateKeywords(section: ContentSection): string[] {
  const text = (section.content + ' ' + (section.heading || '') + ' ' + (section.question || ''))
    .toLowerCase();

  // Extract significant words
  const words = text
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter((w) => !STOP_WORDS.has(w));

  // Count word frequency
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  // Return top keywords
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

/**
 * Get default priority for a category
 */
function getPriorityForCategory(category: KnowledgeCategory): number {
  const priorities: Record<KnowledgeCategory, number> = {
    faq: 8,
    policy: 9,
    amenity: 7,
    service: 7,
    dining: 6,
    room_type: 5,
    local_info: 4,
    contact: 6,
    other: 3,
  };
  return priorities[category] || 5;
}

/**
 * Format content for storage
 */
function formatContent(section: ContentSection): string {
  if (section.type === 'faq' && section.question && section.answer) {
    return `Q: ${section.question}\nA: ${section.answer}`;
  }
  return section.content;
}

/**
 * Batch sections for efficient processing
 */
function batchSections(sections: ContentSection[], batchSize: number): ContentSection[][] {
  const batches: ContentSection[][] = [];
  for (let i = 0; i < sections.length; i += batchSize) {
    batches.push(sections.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Common stop words to filter from keywords
 */
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'had',
  'her',
  'was',
  'one',
  'our',
  'out',
  'has',
  'have',
  'been',
  'were',
  'said',
  'each',
  'she',
  'which',
  'their',
  'will',
  'other',
  'about',
  'many',
  'then',
  'them',
  'these',
  'some',
  'would',
  'make',
  'like',
  'into',
  'time',
  'very',
  'when',
  'come',
  'made',
  'find',
  'more',
  'with',
  'that',
  'this',
  'from',
  'they',
  'what',
  'there',
  'your',
]);
