/**
 * Site Scraper Extension
 *
 * Tool for importing knowledge base content from hotel websites.
 *
 * @module extensions/tools/site-scraper
 */

export { manifest } from './manifest.js';
export { scrapeUrl, scrapeUrls, type ScrapeOptions, type ScrapeResult } from './scraper.js';
export {
  parseHtml,
  type ParseOptions,
  type ParsedContent,
  type ContentSection,
  type PageMetadata,
} from './parser.js';
export {
  processContent,
  type ProcessedEntry,
  type ProcessContext,
  type KnowledgeCategory,
} from './processor.js';
export { siteScraperRoutes } from './routes.js';
