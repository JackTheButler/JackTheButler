/**
 * Setup Utilities
 *
 * Helper functions for the setup wizard.
 *
 * @module features/setup/utils
 */

import type {
  ChatStep,
  KnowledgeCategory,
  ExtractedEntry,
  ChecklistItem,
  KnowledgeChecklist,
} from './types';

/**
 * Get progress step number for the progress bar
 */
export function getProgressStep(step: string, chatStep: ChatStep): number {
  if (step === 'bootstrap') return 0;
  if (
    chatStep === 'greeting' ||
    chatStep === 'ask_name' ||
    chatStep === 'ask_type'
  )
    return 1;
  if (chatStep === 'ask_ai_provider' || chatStep === 'ask_api_key') return 2;
  if (
    chatStep === 'ask_website' ||
    chatStep === 'scraping' ||
    chatStep === 'show_checklist' ||
    chatStep.startsWith('ask_manual_')
  )
    return 3;
  if (chatStep === 'ask_admin') return 4;
  if (chatStep === 'complete' || chatStep === 'done') return 5;
  return 0;
}

/**
 * Get the translation key for a manual entry question
 */
export function getQuestionKeyForCategory(category: string): string {
  switch (category) {
    case 'policy':
      return 'knowledge.askCheckin';
    case 'room_type':
      return 'knowledge.askRoomType';
    case 'contact':
      return 'knowledge.askContact';
    case 'local_info':
      return 'knowledge.askLocation';
    default:
      return 'knowledge.askWebsite';
  }
}

/**
 * Get category and title for a manual entry step
 */
export function getManualEntryInfo(
  chatStep: ChatStep
): { category: KnowledgeCategory; title: string } | null {
  switch (chatStep) {
    case 'ask_manual_checkin':
      return { category: 'policy', title: 'Check-in/Check-out Times' };
    case 'ask_manual_room':
      return { category: 'room_type', title: 'Room Type' };
    case 'ask_manual_contact':
      return { category: 'contact', title: 'Contact Information' };
    case 'ask_manual_location':
      return { category: 'local_info', title: 'Location & Address' };
    default:
      return null;
  }
}

/**
 * Normalize a URL (add https if missing)
 */
export function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}

/**
 * Validate a URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deduplicate entries by title and category
 */
export function deduplicateEntries(
  existing: ExtractedEntry[],
  newEntries: ExtractedEntry[]
): ExtractedEntry[] {
  const seen = new Set<string>();

  // Add existing entries to seen set
  for (const entry of existing) {
    const key = `${entry.category}:${entry.title.toLowerCase().trim()}`;
    seen.add(key);
  }

  // Filter new entries, keeping only unique ones
  const unique: ExtractedEntry[] = [];
  for (const entry of newEntries) {
    const key = `${entry.category}:${entry.title.toLowerCase().trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(entry);
    }
  }

  return unique;
}

/**
 * Build checklist from scraped entries
 */
export function buildChecklist(
  entries: ExtractedEntry[],
  t: (key: string) => string
): KnowledgeChecklist {
  const categoryToItem: Record<string, string> = {
    policy: 'policy',
    room_type: 'room_type',
    contact: 'contact',
    local_info: 'local_info',
    amenity: 'amenity',
    service: 'service',
    dining: 'dining',
    faq: 'faq',
    other: 'other',
  };

  const categoryCounts: Record<string, number> = {};
  for (const entry of entries) {
    const itemId = categoryToItem[entry.category] || 'other';
    categoryCounts[itemId] = (categoryCounts[itemId] || 0) + 1;
  }

  const items: ChecklistItem[] = [
    {
      id: 'policy',
      label: t('knowledge.items.policy'),
      found: (categoryCounts['policy'] || 0) > 0,
      count: categoryCounts['policy'],
      required: true,
    },
    {
      id: 'room_type',
      label: t('knowledge.items.room_type'),
      found: (categoryCounts['room_type'] || 0) > 0,
      count: categoryCounts['room_type'],
      required: true,
    },
    {
      id: 'contact',
      label: t('knowledge.items.contact'),
      found: (categoryCounts['contact'] || 0) > 0,
      count: categoryCounts['contact'],
      required: true,
    },
    {
      id: 'local_info',
      label: t('knowledge.items.local_info'),
      found: (categoryCounts['local_info'] || 0) > 0,
      count: categoryCounts['local_info'],
      required: true,
    },
    {
      id: 'amenity',
      label: t('knowledge.items.amenity'),
      found: (categoryCounts['amenity'] || 0) > 0,
      count: categoryCounts['amenity'],
      required: false,
    },
    {
      id: 'service',
      label: t('knowledge.items.service'),
      found: (categoryCounts['service'] || 0) > 0,
      count: categoryCounts['service'],
      required: false,
    },
    {
      id: 'dining',
      label: t('knowledge.items.dining'),
      found: (categoryCounts['dining'] || 0) > 0,
      count: categoryCounts['dining'],
      required: false,
    },
    {
      id: 'faq',
      label: t('knowledge.items.faq'),
      found: (categoryCounts['faq'] || 0) > 0,
      count: categoryCounts['faq'],
      required: false,
    },
  ];

  const requiredMet = items
    .filter((item) => item.required)
    .every((item) => item.found);

  return { items, entries, canContinue: requiredMet };
}
