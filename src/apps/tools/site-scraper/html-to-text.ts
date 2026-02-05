/**
 * Site Scraper - HTML to Clean Text Converter
 *
 * Strips HTML to clean text while preserving heading hierarchy.
 * Sits between fetcher and AI parser.
 *
 * @module extensions/tools/site-scraper/html-to-text
 */

import * as cheerio from 'cheerio';

/**
 * Result of converting HTML to clean text
 */
export interface CleanTextResult {
  /** Page title */
  title: string;
  /** Clean text with markdown-style heading markers */
  text: string;
  /** Word count of clean text */
  wordCount: number;
}

/**
 * Selectors to exclude (reused from parser.ts)
 */
const EXCLUDE_SELECTORS = [
  'nav',
  'header:not([class*="property"]):not([class*="hotel"]):not([class*="hostel"])',
  'footer',
  '.navigation',
  '.nav',
  '.menu:not([class*="info"])',
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
 * Convert HTML to clean text with heading hierarchy preserved
 */
export function htmlToCleanText(html: string): CleanTextResult {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  for (const sel of EXCLUDE_SELECTORS) {
    $(sel).remove();
  }

  // Extract title
  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').text().split('|')[0]?.split('-')[0]?.trim() ||
    '';

  // Determine content root
  // Pick the most specific container, but fall back to body if the
  // candidate holds less than 40% of the body text (it's likely a
  // narrow sidebar/widget rather than the real content area).
  const bodyText = $('body').text().length;
  const MIN_RATIO = 0.4;

  const candidates = [
    $('main'),
    $('article'),
    $('.content'),
    $('#content'),
  ];

  let $content = $('body');
  for (const $candidate of candidates) {
    if ($candidate.length > 0 && $candidate.text().length / bodyText >= MIN_RATIO) {
      $content = $candidate;
      break;
    }
  }

  // Convert headings to markdown-style markers before extracting text
  $content.find('h1').each((_, el) => {
    const text = $(el).text().trim();
    if (text) $(el).replaceWith(`\n# ${text}\n`);
  });
  $content.find('h2').each((_, el) => {
    const text = $(el).text().trim();
    if (text) $(el).replaceWith(`\n## ${text}\n`);
  });
  $content.find('h3').each((_, el) => {
    const text = $(el).text().trim();
    if (text) $(el).replaceWith(`\n### ${text}\n`);
  });
  $content.find('h4').each((_, el) => {
    const text = $(el).text().trim();
    if (text) $(el).replaceWith(`\n#### ${text}\n`);
  });
  $content.find('h5, h6').each((_, el) => {
    const text = $(el).text().trim();
    if (text) $(el).replaceWith(`\n##### ${text}\n`);
  });

  // Add line breaks for block elements
  $content.find('p, br, li, tr, div').each((_, el) => {
    $(el).append('\n');
  });

  // Add bullet markers for list items
  $content.find('li').each((_, el) => {
    $(el).prepend('- ');
  });

  // Extract text and collapse whitespace
  let text = $content.text();

  // Collapse multiple spaces (but not newlines) to single space
  text = text.replace(/[^\S\n]+/g, ' ');
  // Collapse 3+ newlines to 2
  text = text.replace(/\n{3,}/g, '\n\n');
  // Trim each line
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
  // Remove leading/trailing whitespace
  text = text.trim();

  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;

  return { title, text, wordCount };
}
