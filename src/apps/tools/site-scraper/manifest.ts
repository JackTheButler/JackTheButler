/**
 * Site Scraper Extension Manifest
 *
 * Tool for importing knowledge base content from hotel websites.
 *
 * @module extensions/tools/site-scraper/manifest
 */

import type { ToolAppManifest } from '../../types.js';

export const manifest: ToolAppManifest = {
  id: 'tool-site-scraper',
  name: 'Site Scraper',
  category: 'tool',
  version: '1.0.0',
  description: 'Import knowledge base content from hotel website pages (FAQ, amenities, policies)',
  icon: '🌐',
  docsUrl: '/docs/tools/site-scraper',
  dashboardRoute: '/tools/site-scraper',
  configSchema: [],
  capabilities: {
    hasUI: true,
    hasAPI: true,
    requiresAI: true,
  },
};
