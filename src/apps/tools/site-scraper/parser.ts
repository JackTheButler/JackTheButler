/**
 * Site Scraper - HTML Parser
 *
 * Extracts structured content from HTML using cheerio.
 *
 * @module extensions/tools/site-scraper/parser
 */

import * as cheerio from 'cheerio';
import { logger } from '@/utils/logger.js';

/**
 * Parser options
 */
export interface ParseOptions {
  /** CSS selector to target specific content area */
  selector?: string | undefined;
  /** CSS selectors to exclude from content */
  excludeSelectors?: string[] | undefined;
}

/**
 * Metadata extracted from the page
 */
export interface PageMetadata {
  description?: string | undefined;
  keywords?: string[] | undefined;
  language?: string | undefined;
  ogTitle?: string | undefined;
  ogDescription?: string | undefined;
}

/**
 * A section of content extracted from the page
 */
export interface ContentSection {
  /** Heading text (if any) */
  heading?: string | undefined;
  /** Content text */
  content: string;
  /** Type of content */
  type: 'paragraph' | 'list' | 'table' | 'faq';
  /** For FAQ type: the question */
  question?: string | undefined;
  /** For FAQ type: the answer */
  answer?: string | undefined;
}

/**
 * Result of parsing HTML
 */
export interface ParsedContent {
  title: string;
  sections: ContentSection[];
  metadata: PageMetadata;
}

/**
 * Default selectors to exclude (navigation, headers, footers, etc.)
 */
const DEFAULT_EXCLUDE_SELECTORS = [
  'nav',
  'header:not([class*="property"]):not([class*="hotel"]):not([class*="hostel"])',
  'footer',
  '.navigation',
  '.nav',
  '.menu:not([class*="info"])',
  // Note: .sidebar and .widget often contain important hotel info, so we don't exclude them
  '.cookie-banner',
  '.cookie-notice',
  '.popup',
  '.modal',
  '.social-share',
  '.comments',
  '.advertisement',
  '.ads',
  '.ad-banner',
  'script',
  'style',
  'noscript',
  'iframe',
  '[role="navigation"]',
  '[aria-hidden="true"]',
  '.breadcrumb',
  '.breadcrumbs',
  '.pagination',
  '.share-buttons',
  '.booking-widget',
  '.search-form',
  '.newsletter-signup',
];

/**
 * Parse HTML and extract structured content
 */
export function parseHtml(html: string, options: ParseOptions = {}): ParsedContent {
  const { selector, excludeSelectors = [] } = options;

  const $ = cheerio.load(html);

  // Remove unwanted elements
  const allExcludeSelectors = [...DEFAULT_EXCLUDE_SELECTORS, ...excludeSelectors];
  allExcludeSelectors.forEach((sel) => {
    $(sel).remove();
  });

  // Extract metadata
  const metadata = extractMetadata($);

  // Extract title
  const title = extractTitle($);

  // Determine content root
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let $content: cheerio.Cheerio<any>;
  if (selector) {
    $content = $(selector);
  } else {
    // Try common content containers
    $content =
      $('main').length > 0
        ? $('main')
        : $('article').length > 0
          ? $('article')
          : $('.content').length > 0
            ? $('.content')
            : $('#content').length > 0
              ? $('#content')
              : $('body');
  }

  // Extract sections
  const sections = extractSections($, $content);

  logger.debug({ title, sectionCount: sections.length, hasMetadata: !!metadata.description }, 'Parsed HTML content');

  return { title, sections, metadata };
}

/**
 * Extract page metadata from head
 */
function extractMetadata($: cheerio.CheerioAPI): PageMetadata {
  const description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    undefined;

  const keywordsStr = $('meta[name="keywords"]').attr('content');
  const keywords = keywordsStr
    ? keywordsStr.split(',').map((k) => k.trim().toLowerCase())
    : undefined;

  const language = $('html').attr('lang') || $('meta[http-equiv="content-language"]').attr('content') || undefined;

  const ogTitle = $('meta[property="og:title"]').attr('content') || undefined;
  const ogDescription = $('meta[property="og:description"]').attr('content') || undefined;

  return {
    description,
    keywords,
    language,
    ogTitle,
    ogDescription,
  };
}

/**
 * Extract page title
 */
function extractTitle($: cheerio.CheerioAPI): string {
  // Try h1 first (usually the page title)
  const h1 = $('h1').first().text().trim();
  if (h1) return h1;

  // Fall back to title tag
  const title = $('title').text().trim();

  // Clean up common suffixes like " | Hotel Name"
  const cleaned = title.split('|')[0]?.split('-')[0]?.trim();
  return cleaned || title;
}

/**
 * Extract content sections from the page
 */
function extractSections(
  $: cheerio.CheerioAPI,
  $content: cheerio.Cheerio<any>
): ContentSection[] {
  const sections: ContentSection[] = [];

  // First, try to detect FAQ patterns
  const faqSections = extractFaqSections($, $content);
  if (faqSections.length > 0) {
    sections.push(...faqSections);
  }

  // Extract key-value info sections (check-in times, policies, etc.)
  const infoSections = extractInfoSections($, $content);
  sections.push(...infoSections);

  // Extract sections by headings (h2, h3, h4)
  const headingSections = extractHeadingSections($, $content);
  sections.push(...headingSections);

  // If no sections found, extract all paragraphs
  if (sections.length === 0) {
    const paragraphSections = extractParagraphSections($, $content);
    sections.push(...paragraphSections);
  }

  // Extract tables
  const tableSections = extractTableSections($, $content);
  sections.push(...tableSections);

  // Extract list content that may have been missed
  const listSections = extractListSections($, $content);
  sections.push(...listSections);

  // Deduplicate and filter empty sections
  const filtered = sections.filter((s) => {
    const content = s.content || s.answer || '';
    return content.trim().length > 20; // Minimum content length
  });

  // Deduplicate by content similarity
  const deduplicated = deduplicateSections(filtered);

  return deduplicated;
}

/**
 * Extract key-value info sections (check-in times, policies, amenities, etc.)
 * These are often in definition lists, info boxes, or labeled divs
 */
function extractInfoSections(
  $: cheerio.CheerioAPI,
  $content: cheerio.Cheerio<any>
): ContentSection[] {
  const sections: ContentSection[] = [];

  // Pattern 1: Definition lists (dl/dt/dd) for general info (not just FAQ)
  $content.find('dl').each((_, dl) => {
    const $dl = $(dl);
    const items: string[] = [];
    let heading: string | undefined;

    // Check for a preceding heading
    const $prevHeading = $dl.prev('h2, h3, h4, h5');
    if ($prevHeading.length > 0) {
      heading = $prevHeading.text().trim();
    }

    $dl.find('dt').each((_, dt) => {
      const label = $(dt).text().trim();
      const value = $(dt).next('dd').text().trim();
      if (label && value) {
        items.push(`${label}: ${value}`);
      }
    });

    if (items.length > 0) {
      sections.push({
        type: 'list',
        heading,
        content: items.join('\n'),
      });
    }
  });

  // Pattern 2: Key-value divs with common class patterns
  const infoSelectors = [
    '.info-section',
    '.details-section',
    '.property-info',
    '.hotel-info',
    '.hostel-info',
    '.accommodation-info',
    '.opening-times',
    '.opening-hours',
    '.check-in-out',
    '.policies',
    '.rules',
    '.amenities-list',
    '.facilities-list',
    '[class*="info-box"]',
    '[class*="detail-box"]',
  ];

  infoSelectors.forEach((selector) => {
    $content.find(selector).each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const heading = $el.find('h2, h3, h4, h5').first().text().trim() || undefined;

      if (text.length > 20) {
        sections.push({
          type: 'paragraph',
          heading,
          content: text,
        });
      }
    });
  });

  // Pattern 3: Look for labeled content patterns anywhere
  // This catches things like "Check-in: 2pm" that might be in spans or divs
  const labelPatterns = [
    /check[\s-]?in[:\s]+(.+)/i,
    /check[\s-]?out[:\s]+(.+)/i,
    /reception[:\s]+(.+)/i,
    /opening[\s]?hours?[:\s]+(.+)/i,
    /hours[\s]?of[\s]?operation[:\s]+(.+)/i,
  ];

  // Find text nodes that match these patterns
  $content.find('*').each((_, el) => {
    const $el = $(el);
    // Only process leaf nodes with direct text
    if ($el.children().length === 0) {
      const text = $el.text().trim();
      for (const pattern of labelPatterns) {
        if (pattern.test(text) && text.length > 10 && text.length < 200) {
          // Check if this content is already captured
          const alreadyCaptured = sections.some(
            (s) => s.content.includes(text) || text.includes(s.content)
          );
          if (!alreadyCaptured) {
            // Try to get section heading from ancestors
            const $ancestor = $el.closest('[class*="section"], [class*="box"], [class*="card"]');
            const heading = $ancestor.find('h2, h3, h4, h5').first().text().trim() || undefined;

            sections.push({
              type: 'paragraph',
              heading: heading || 'Property Information',
              content: text,
            });
          }
          break;
        }
      }
    }
  });

  return sections;
}

/**
 * Extract FAQ-style content (Q&A patterns)
 */
function extractFaqSections(
  $: cheerio.CheerioAPI,
  $content: cheerio.Cheerio<any>
): ContentSection[] {
  const sections: ContentSection[] = [];

  // Pattern 1: Schema.org FAQ markup
  $content.find('[itemtype*="FAQPage"] [itemprop="mainEntity"]').each((_, el) => {
    const question = $(el).find('[itemprop="name"]').text().trim();
    const answer = $(el).find('[itemprop="acceptedAnswer"] [itemprop="text"]').text().trim();

    if (question && answer) {
      sections.push({
        type: 'faq',
        content: `${question}\n${answer}`,
        question,
        answer,
      });
    }
  });

  // Pattern 2: Definition lists (dl/dt/dd)
  $content.find('dl').each((_, dl) => {
    $(dl)
      .find('dt')
      .each((_, dt) => {
        const question = $(dt).text().trim();
        const answer = $(dt).next('dd').text().trim();

        if (question && answer) {
          sections.push({
            type: 'faq',
            content: `${question}\n${answer}`,
            question,
            answer,
          });
        }
      });
  });

  // Pattern 3: Accordion-style FAQ (common CSS classes)
  const accordionSelectors = [
    '.accordion-item',
    '.faq-item',
    '[data-accordion]',
    '.collapsible',
    '.toggle-item',
  ];

  accordionSelectors.forEach((selector) => {
    $content.find(selector).each((_, item) => {
      const $item = $(item);
      const questionEl = $item.find(
        '.accordion-header, .faq-question, [data-accordion-header], .toggle-header, h3, h4'
      );
      const answerEl = $item.find(
        '.accordion-body, .faq-answer, [data-accordion-body], .toggle-content, p'
      );

      const question = questionEl.first().text().trim();
      const answer = answerEl.text().trim();

      if (question && answer && question !== answer) {
        sections.push({
          type: 'faq',
          content: `${question}\n${answer}`,
          question,
          answer,
        });
      }
    });
  });

  return sections;
}

/**
 * Extract sections based on headings
 */
function extractHeadingSections(
  $: cheerio.CheerioAPI,
  $content: cheerio.Cheerio<any>
): ContentSection[] {
  const sections: ContentSection[] = [];

  // Find all h2, h3, and h4 headings (h4 often used for hotel info sections)
  $content.find('h2, h3, h4').each((_, heading) => {
    const $heading = $(heading);
    const headingText = $heading.text().trim();

    // Skip if heading looks like navigation or is too short
    if (!headingText || headingText.length < 3 || headingText.length > 150) {
      return;
    }

    // Collect content until next heading of same or higher level
    const contentParts: string[] = [];
    let $next = $heading.next();
    const headingLevel = parseInt(heading.tagName.replace('h', ''), 10);

    while ($next.length > 0) {
      // Stop at same level or higher heading
      if ($next.is('h1, h2, h3, h4')) {
        const nextLevel = parseInt($next.prop('tagName')?.replace('H', '') || '0', 10);
        if (nextLevel <= headingLevel) {
          break;
        }
      }

      if ($next.is('p, ul, ol, dl, div:not([class*="nav"]):not([class*="menu"])')) {
        const text = $next.text().trim();
        if (text && text.length > 10) {
          contentParts.push(text);
        }
      }
      $next = $next.next();
    }

    if (headingText && contentParts.length > 0) {
      // Detect if content is primarily a list
      const $nextSibling = $heading.next();
      const isListContent = $nextSibling.is('ul, ol, dl');

      sections.push({
        type: isListContent ? 'list' : 'paragraph',
        heading: headingText,
        content: contentParts.join('\n\n'),
      });
    }
  });

  return sections;
}

/**
 * Extract standalone paragraphs
 */
function extractParagraphSections(
  $: cheerio.CheerioAPI,
  $content: cheerio.Cheerio<any>
): ContentSection[] {
  const sections: ContentSection[] = [];
  const currentContent: string[] = [];

  $content.find('p').each((_, p) => {
    const text = $(p).text().trim();
    if (text.length > 30) {
      currentContent.push(text);
    }
  });

  if (currentContent.length > 0) {
    sections.push({
      type: 'paragraph',
      content: currentContent.join('\n\n'),
    });
  }

  return sections;
}

/**
 * Extract table content
 */
function extractTableSections(
  $: cheerio.CheerioAPI,
  $content: cheerio.Cheerio<any>
): ContentSection[] {
  const sections: ContentSection[] = [];

  $content.find('table').each((_, table) => {
    const $table = $(table);
    const rows: string[] = [];

    // Get headers
    const headers: string[] = [];
    $table.find('thead th, thead td').each((_, th) => {
      headers.push($(th).text().trim());
    });

    if (headers.length > 0) {
      rows.push(headers.join(' | '));
    }

    // Get body rows
    $table.find('tbody tr').each((_, tr) => {
      const cells: string[] = [];
      $(tr)
        .find('td, th')
        .each((_, td) => {
          cells.push($(td).text().trim());
        });
      if (cells.length > 0) {
        rows.push(cells.join(' | '));
      }
    });

    if (rows.length > 1) {
      // Get preceding heading as context
      const heading = $table.prev('h2, h3, h4').text().trim() || undefined;

      sections.push({
        type: 'table',
        heading,
        content: rows.join('\n'),
      });
    }
  });

  return sections;
}

/**
 * Extract list content that might not be under headings
 */
function extractListSections(
  $: cheerio.CheerioAPI,
  $content: cheerio.Cheerio<any>
): ContentSection[] {
  const sections: ContentSection[] = [];

  // Find lists that have a preceding label or heading-like element
  $content.find('ul, ol').each((_, list) => {
    const $list = $(list);
    const items: string[] = [];

    $list.find('> li').each((_, li) => {
      const text = $(li).text().trim();
      if (text.length > 5) {
        items.push(`• ${text}`);
      }
    });

    if (items.length >= 2) {
      // Look for preceding heading or label
      let heading: string | undefined;
      const $prev = $list.prev();

      if ($prev.is('h2, h3, h4, h5, strong, b, label, span')) {
        heading = $prev.text().trim();
      } else {
        // Check parent for a heading
        const $parent = $list.parent();
        const $parentHeading = $parent.find('> h2, > h3, > h4, > h5, > strong').first();
        if ($parentHeading.length > 0) {
          heading = $parentHeading.text().trim();
        }
      }

      // Only add if we have a heading (to avoid capturing random navigation lists)
      if (heading && heading.length > 2 && heading.length < 100) {
        sections.push({
          type: 'list',
          heading,
          content: items.join('\n'),
        });
      }
    }
  });

  return sections;
}

/**
 * Deduplicate sections by content similarity
 */
function deduplicateSections(sections: ContentSection[]): ContentSection[] {
  const seen = new Set<string>();
  const result: ContentSection[] = [];

  for (const section of sections) {
    // Create a normalized key for comparison
    const normalizedContent = section.content.toLowerCase().replace(/\s+/g, ' ').trim();
    const key = normalizedContent.substring(0, 100);

    if (!seen.has(key)) {
      seen.add(key);
      result.push(section);
    }
  }

  return result;
}
