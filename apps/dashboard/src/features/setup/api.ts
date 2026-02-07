/**
 * Setup API Client
 *
 * API calls for the setup wizard.
 *
 * @module features/setup/api
 */

import type { SetupState, ProcessMessageResponse, ExtractedEntry, AIProvider, HotelProfile } from './types';

const BASE_PATH = '/api/v1/setup';
const SCRAPER_PATH = '/api/v1/tools/site-scraper';

/**
 * Get current setup state
 */
export async function getSetupState(): Promise<SetupState> {
  const response = await fetch(`${BASE_PATH}/state`);
  return response.json();
}

/**
 * Start the setup wizard
 */
export async function startSetup(): Promise<void> {
  await fetch(`${BASE_PATH}/start`, { method: 'POST' });
}

/**
 * Complete the bootstrap step
 */
export async function completeBootstrap(): Promise<void> {
  await fetch(`${BASE_PATH}/bootstrap`, { method: 'POST' });
}

/**
 * Skip setup entirely
 */
export async function skipSetup(): Promise<void> {
  await fetch(`${BASE_PATH}/skip`, { method: 'POST' });
}

/**
 * Save property info
 */
export async function savePropertyInfo(name: string, type: string): Promise<void> {
  await fetch(`${BASE_PATH}/welcome`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type }),
  });
}

/**
 * Configure AI provider
 */
export async function configureAIProvider(
  provider: AIProvider,
  apiKey?: string
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(`${BASE_PATH}/ai-provider`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey }),
  });

  const data = await response.json();

  if (!response.ok) {
    return { ok: false, error: data.error?.message || 'Failed to configure AI' };
  }

  return { ok: true };
}

/**
 * Process a user message with AI
 */
export async function processMessage(
  message: string,
  step: string,
  propertyName: string,
  propertyType: string,
  question: string
): Promise<ProcessMessageResponse | null> {
  try {
    const response = await fetch(`${BASE_PATH}/process-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        step,
        propertyName: propertyName || 'your property',
        propertyType: propertyType || 'property',
        question,
      }),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Sync hotel profile from knowledge
 */
export async function syncProfile(): Promise<HotelProfile | null> {
  try {
    const response = await fetch(`${BASE_PATH}/sync-profile`, { method: 'POST' });
    if (!response.ok) return null;
    const data = await response.json();
    return data.profile || null;
  } catch {
    return null;
  }
}

/**
 * Complete knowledge gathering step
 */
export async function completeKnowledge(): Promise<void> {
  await fetch(`${BASE_PATH}/knowledge/complete`, { method: 'POST' });
}

/**
 * Create admin account
 */
export async function createAdmin(
  email: string,
  password: string,
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(`${BASE_PATH}/create-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  const data = await response.json();

  if (!response.ok) {
    return { ok: false, error: data.error?.message || 'Failed to create admin' };
  }

  return { ok: true };
}

/**
 * Parse/scrape website for knowledge
 */
export async function parseWebsite(
  url: string,
  hotelName: string
): Promise<{ ok: boolean; entries?: ExtractedEntry[]; error?: string }> {
  const response = await fetch(`${SCRAPER_PATH}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urls: [url],
      options: { hotelName },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return { ok: false, error: data.error?.message || 'Failed to parse website' };
  }

  return { ok: true, entries: data.entries || [] };
}

/**
 * Import entries to knowledge base
 */
export async function importKnowledge(
  entries: Array<{
    category: string;
    title: string;
    content: string;
    keywords: string[];
    priority: number;
    sourceUrl: string;
  }>
): Promise<void> {
  await fetch(`${SCRAPER_PATH}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
}
