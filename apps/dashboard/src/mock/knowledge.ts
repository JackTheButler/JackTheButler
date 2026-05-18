import type { LucideIcon } from 'lucide-react';
import { MessageSquareText, FileText, Globe, Boxes } from 'lucide-react';

/**
 * Hybrid model:
 *  - Derived sources (documents / websites / connectors) are managed as one
 *    row each — their chunks are auto-generated, not hand-edited.
 *  - Q&A is authored, so each pair is its own entry row (add/edit/delete).
 * Dedup/priority across sources is a pipeline concern (deferred), not UI.
 */

export type SourceType = 'document' | 'website' | 'connector';
export type SourceStatus = 'ready' | 'indexing' | 'queued' | 'failed' | 'disabled';
export type EntryStatus = 'ready' | 'disabled';

export interface KnowledgeSource {
  id: string;
  title: string;
  type: SourceType;
  origin: string; // "Upload", "Crawl", "via Notion"
  status: SourceStatus;
  entries: number; // indexed chunks
  updated: string;
}

export interface QaEntry {
  id: string;
  question: string;
  answer: string;
  status: EntryStatus;
  updated: string;
}

export const sourceMeta: Record<SourceType | 'qa', { label: string; icon: LucideIcon }> = {
  qa: { label: 'Q&A', icon: MessageSquareText },
  document: { label: 'Document', icon: FileText },
  website: { label: 'Website', icon: Globe },
  connector: { label: 'Connector', icon: Boxes },
};

export const sources: KnowledgeSource[] = [
  {
    id: 's2',
    title: 'Refund & returns policy.pdf',
    type: 'document',
    origin: 'Upload',
    status: 'ready',
    entries: 18,
    updated: 'Yesterday',
  },
  {
    id: 's3',
    title: 'Onboarding guide.md',
    type: 'document',
    origin: 'Upload',
    status: 'indexing',
    entries: 0,
    updated: 'Just now',
  },
  {
    id: 's4',
    title: 'acme.co/help',
    type: 'website',
    origin: 'Crawl',
    status: 'ready',
    entries: 126,
    updated: '3d ago',
  },
  {
    id: 's5',
    title: 'pricing & plans',
    type: 'website',
    origin: 'Crawl',
    status: 'failed',
    entries: 0,
    updated: '3d ago',
  },
  {
    id: 's6',
    title: 'Product Docs',
    type: 'connector',
    origin: 'via Notion',
    status: 'ready',
    entries: 73,
    updated: '6h ago',
  },
];

export const qaEntries: QaEntry[] = [
  {
    id: 'q1',
    question: 'How do I reset my password?',
    answer: 'Use “Forgot password” on the login screen; the reset link is valid for 30 minutes.',
    status: 'ready',
    updated: '2h ago',
  },
  {
    id: 'q2',
    question: 'What are your support hours?',
    answer: 'Live support is 9am–6pm CET on weekdays; the AI assistant answers 24/7.',
    status: 'ready',
    updated: '2h ago',
  },
  {
    id: 'q3',
    question: 'Do you offer annual billing?',
    answer: 'Yes — annual billing saves 20% versus monthly and can be changed in Billing.',
    status: 'ready',
    updated: '1d ago',
  },
  {
    id: 'q4',
    question: 'How do I export my data?',
    answer: 'Settings → Data → Export produces a CSV; you also get an email when it is ready.',
    status: 'disabled',
    updated: '2w ago',
  },
];

export const sourceFilters = ['All', 'Q&A', 'Documents', 'Websites', 'Connectors'] as const;
export type SourceFilter = (typeof sourceFilters)[number];

export const showSources = (f: SourceFilter) =>
  f === 'All' || f === 'Documents' || f === 'Websites' || f === 'Connectors';
export const showQa = (f: SourceFilter) => f === 'All' || f === 'Q&A';

export function sourceInFilter(s: KnowledgeSource, f: SourceFilter): boolean {
  if (f === 'All') return true;
  if (f === 'Documents') return s.type === 'document';
  if (f === 'Websites') return s.type === 'website';
  if (f === 'Connectors') return s.type === 'connector';
  return false;
}
