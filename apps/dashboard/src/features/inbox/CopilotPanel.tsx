import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Check, ChevronRight, Search, Loader2 } from 'lucide-react';
import type { KnowledgeHitDTO } from '@janetheoperator/shared';
import { Drawer, Badge, Button, Input, cn } from '@/components/ui';
import { JaneLoader } from '@/components/JaneLoader';
import { api } from '@/lib/api';

/**
 * Agent copilot. The search is prefilled with the customer's last message and
 * runs a real KB search (POST /knowledge/search); the agent selects entries
 * (selection persists across searches) and generates a reply grounded in them.
 *
 * Generation is still mocked — wired in part 2.
 */

const ERROR_TEXT: Record<string, string> = {
  no_embedding: 'Connect an embedding provider in Apps to search the knowledge base.',
  embedding_failed: 'Something went wrong while searching. Please try again.',
  no_generation: 'Connect a generation provider in Apps to draft a reply.',
  generation_failed: 'Could not generate a reply. Please try again.',
  network: 'Connection problem. Please try again.',
};

export function CopilotPanel({
  open,
  onClose,
  lastCustomerMessage,
  onGenerate,
}: {
  open: boolean;
  onClose: () => void;
  lastCustomerMessage?: string;
  /** Receives the generated reply; the parent drops it into the composer and
   *  closes the panel (no in-drawer draft step). */
  onGenerate: (text: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<KnowledgeHitDTO[]>([]);
  const [selected, setSelected] = useState<KnowledgeHitDTO[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Chat-grounding strictness floor; matches below it are flagged as weak.
  const [threshold, setThreshold] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const runSearch = useCallback(async (raw: string) => {
    const query = raw.trim();
    if (!query) {
      setMatches([]);
      setSearched(false);
      setError(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await api.post<{ matches: KnowledgeHitDTO[]; threshold: number; error?: string }>(
        '/api/app/knowledge/search',
        { query },
      );
      setMatches(res.error ? [] : res.matches);
      setThreshold(res.threshold ?? 0);
      setError(res.error ?? null);
    } catch {
      setMatches([]);
      setError('network');
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }, []);

  // Prefill with the customer's last message, reset state, and search it.
  useEffect(() => {
    if (!open) return;
    const initial = lastCustomerMessage ?? '';
    setQuery(initial);
    setSelected([]);
    setExpanded(new Set());
    setMatches([]);
    setSearched(false);
    setError(null);
    setGenerating(false);
    setGenError(null);
    if (initial.trim()) void runSearch(initial);
  }, [open, lastCustomerMessage, runSearch]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // The checkbox is the single toggle — check to add, uncheck to remove.
  const toggleSelect = (e: KnowledgeHitDTO) =>
    setSelected((prev) =>
      prev.some((s) => s.id === e.id) ? prev.filter((s) => s.id !== e.id) : [...prev, e],
    );

  const selectedIds = useMemo(() => new Set(selected.map((e) => e.id)), [selected]);
  // Results exclude already-selected entries (they live in the Selected section).
  const results = useMemo(
    () => matches.filter((e) => !selectedIds.has(e.id)),
    [matches, selectedIds],
  );

  // Draft a reply grounded in the selected entries, in the default language.
  // The customer's last message is the question; the parent drops the reply
  // into the composer (where the translate toggle handles delivery).
  const generate = async () => {
    const question = (lastCustomerMessage ?? query).trim();
    if (selected.length === 0 || !question || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await api.post<{ reply?: string; error?: string }>(
        '/api/app/knowledge/generate-reply',
        { entryIds: selected.map((e) => e.id), question },
      );
      if (res.reply) onGenerate(res.reply);
      else setGenError(res.error ?? 'generation_failed');
    } catch {
      setGenError('network');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Copilot"
      widthClass="sm:w-[36rem]"
      closeLabel="Close copilot"
    >
      <div className="flex h-full flex-col">
        <div className="px-3 py-3">
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runSearch(query);
              }}
              placeholder="Search the knowledge base…"
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => void runSearch(query)}
              disabled={!query.trim() || searching}
              aria-label="Search"
              title="Search"
              className={cn(
                'absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md transition-colors',
                query.trim() && !searching ? 'bg-accent text-on-accent hover:opacity-90' : 'text-muted/50',
              )}
            >
              {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
          {selected.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold text-ink">
                {selected.length} selected to generate reply
              </h3>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {selected.map((e) => (
                  <Row
                    key={e.id}
                    entry={e}
                    selected
                    warn={threshold > 0 && e.similarity < threshold}
                    open={expanded.has(e.id)}
                    onToggle={() => toggleSelect(e)}
                    onExpand={() => toggleExpand(e.id)}
                  />
                ))}
              </ul>
            </section>
          )}

          <section>
            {selected.length > 0 && (
              <h3 className="mb-1.5 text-xs font-semibold text-ink">More matches</h3>
            )}
            {error ? (
              <p className="rounded-lg border border-line px-3 py-4 text-center text-sm text-muted">
                {ERROR_TEXT[error] ?? 'Something went wrong. Please try again.'}
              </p>
            ) : searching ? (
              <div className="flex justify-center rounded-lg border border-line py-8">
                <JaneLoader size={28} float={false} />
              </div>
            ) : results.length === 0 ? (
              <p className="rounded-lg border border-line px-3 py-4 text-center text-sm text-muted">
                {searched ? 'No matches. Try a different search.' : 'Search to find entries.'}
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {results.map((e) => (
                  <Row
                    key={e.id}
                    entry={e}
                    selected={false}
                    warn={threshold > 0 && e.similarity < threshold}
                    open={expanded.has(e.id)}
                    onToggle={() => toggleSelect(e)}
                    onExpand={() => toggleExpand(e.id)}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="sticky bottom-0 border-t border-line bg-panel px-3 py-3">
          {genError && (
            <p className="mb-2 text-center text-xs text-red-600">
              {ERROR_TEXT[genError] ?? 'Could not generate a reply. Please try again.'}
            </p>
          )}
          <Button
            size="md"
            className={cn('w-full', selected.length === 0 && 'opacity-60')}
            disabled={selected.length === 0 || generating}
            onClick={() => void generate()}
          >
            {generating ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles size={15} />
                {selected.length > 0 ? 'Generate reply' : 'Select knowledge'}
              </>
            )}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

/** One KB entry row: a checkbox to select/deselect (the single toggle), and a
 *  click target to expand the answer. Shared by the Selected and Matches lists. */
function Row({
  entry,
  selected,
  warn,
  open,
  onToggle,
  onExpand,
}: {
  entry: KnowledgeHitDTO;
  selected: boolean;
  /** Below the chat-grounding strictness floor — flagged with a warning tint. */
  warn?: boolean;
  open: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  return (
    <li className={cn(warn && 'bg-amber-500/[0.06]')} title={warn ? 'Below your match strictness' : undefined}>
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? 'Deselect entry' : 'Select entry'}
          onClick={onToggle}
          className={cn(
            'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors',
            selected ? 'border-accent bg-accent text-on-accent' : 'border-line hover:border-accent',
          )}
        >
          {selected && <Check size={12} />}
        </button>
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronRight
            size={14}
            className={cn('mt-0.5 shrink-0 text-muted transition-transform', open && 'rotate-90')}
          />
          <span
            className={cn('min-w-0 flex-1 text-sm font-medium text-ink', !open && 'truncate')}
            dir="auto"
          >
            {entry.question}
          </span>
        </button>
        {entry.topic && (
          <Badge tone="muted" shape="tag" className="shrink-0">
            {entry.topic}
          </Badge>
        )}
        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink">
          {Math.round(entry.similarity * 100)}%
        </span>
      </div>
      {open && (
        <p className="px-3 pb-3 pl-[3.5rem] text-sm text-muted" dir="auto">
          {entry.answer}
        </p>
      )}
    </li>
  );
}
