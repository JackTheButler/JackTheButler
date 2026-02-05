/**
 * Site Scraper - Core Scraping Logic
 *
 * Fetches web pages with proper error handling, timeouts, and rate limiting.
 *
 * @module extensions/tools/site-scraper/scraper
 */

import { logger } from '@/utils/logger.js';

/**
 * Scrape options for a single URL
 */
export interface ScrapeOptions {
  url: string;
  /** CSS selector to target specific content area */
  selector?: string | undefined;
  /** CSS selectors to exclude from content */
  excludeSelectors?: string[] | undefined;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number | undefined;
}

/**
 * Result of scraping a single URL
 */
export interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  html: string;
  fetchedAt: string;
  status: 'success' | 'error';
  error?: string;
  statusCode?: number;
}

/**
 * Default timeout for requests (10 seconds)
 */
const DEFAULT_TIMEOUT = 10000;

/**
 * Rate limit delay between requests (500ms)
 */
const RATE_LIMIT_DELAY = 500;

/**
 * User agent for scraping requests
 */
const USER_AGENT = 'Butler/1.0 (Knowledge Base Importer; +https://jackthebutler.com/bot)';

/**
 * Scrape a single URL
 */
export async function scrapeUrl(options: ScrapeOptions): Promise<ScrapeResult> {
  const { url, timeout = DEFAULT_TIMEOUT } = options;

  const startTime = Date.now();
  logger.info({ url, timeout }, 'Scraping URL');

  try {
    // Validate URL
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol. Only HTTP and HTTPS are supported.');
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      // Handle non-2xx responses
      if (!response.ok) {
        const errorMessage = getHttpErrorMessage(response.status);
        logger.warn({ url, status: response.status }, 'HTTP error while scraping');

        return {
          url,
          title: '',
          content: '',
          html: '',
          fetchedAt: new Date().toISOString(),
          status: 'error',
          error: errorMessage,
          statusCode: response.status,
        };
      }

      // Get response text
      const html = await response.text();

      // Extract basic title from HTML
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch?.[1]?.trim() ?? '';

      const duration = Date.now() - startTime;
      logger.info({ url, duration, contentLength: html.length }, 'Successfully scraped URL');

      return {
        url,
        title,
        content: '', // Content extraction is done by parser
        html,
        fetchedAt: new Date().toISOString(),
        status: 'success',
        statusCode: response.status,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = getErrorMessage(error);

    logger.error({ url, error: errorMessage, duration }, 'Failed to scrape URL');

    return {
      url,
      title: '',
      content: '',
      html: '',
      fetchedAt: new Date().toISOString(),
      status: 'error',
      error: errorMessage,
    };
  }
}

/**
 * Scrape multiple URLs with rate limiting
 */
export async function scrapeUrls(
  urls: string[],
  options: Omit<ScrapeOptions, 'url'> = {}
): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];

  logger.info({ urlCount: urls.length }, 'Starting batch scrape');

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url) continue;

    // Rate limiting - wait between requests (except for first)
    if (i > 0) {
      await sleep(RATE_LIMIT_DELAY);
    }

    const result = await scrapeUrl({ url, ...options });
    results.push(result);
  }

  const successCount = results.filter((r) => r.status === 'success').length;
  logger.info(
    {
      total: urls.length,
      success: successCount,
      failed: urls.length - successCount,
    },
    'Batch scrape complete'
  );

  return results;
}

/**
 * Get a user-friendly error message for HTTP status codes
 */
function getHttpErrorMessage(status: number): string {
  const messages: Record<number, string> = {
    400: 'Bad request - the URL may be malformed',
    401: 'Unauthorized - authentication required',
    403: 'Forbidden - access denied (check robots.txt)',
    404: 'Page not found',
    429: 'Rate limited - too many requests',
    500: 'Server error - the website is having issues',
    502: 'Bad gateway - the website is unreachable',
    503: 'Service unavailable - the website is temporarily down',
    504: 'Gateway timeout - the website took too long to respond',
  };

  return messages[status] || `HTTP error ${status}`;
}

/**
 * Get error message from various error types
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'Request timed out';
    }
    if (error.message.includes('ENOTFOUND')) {
      return 'Domain not found';
    }
    if (error.message.includes('ECONNREFUSED')) {
      return 'Connection refused';
    }
    if (error.message.includes('CERT_')) {
      return 'SSL certificate error';
    }
    return error.message;
  }
  return 'Unknown error occurred';
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
