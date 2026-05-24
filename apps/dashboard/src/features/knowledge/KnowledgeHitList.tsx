import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Pencil } from 'lucide-react';
import type { KnowledgeHitDTO } from '@janetheoperator/shared';
import { Badge, cn } from '@/components/ui';

/**
 * Connected, expandable list of knowledge entries. Shared by the Ask Jane
 * sandbox (KbTestPanel) and the inbox retrieval-transparency panel so both
 * render identically. Each row shows the question, optional topic, and
 * relevancy; expanding reveals the answer.
 *
 * `tone` sets the list background: 'surface' (default) reads on the sandbox's
 * tinted card; 'panel' is plain white for the inbox drawer. Row hover uses the
 * opposite token so it always contrasts.
 *
 * `entryHref` (optional) renders an "Edit in Knowledge" link per row, pointing
 * at the live KB entry by id. Omitted in the sandbox (already on the KB page).
 */
export function KnowledgeHitList({
  hits,
  tone = 'surface',
  entryHref,
}: {
  hits: KnowledgeHitDTO[];
  tone?: 'surface' | 'panel';
  entryHref?: (id: string) => string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ul
      className={cn(
        'divide-y divide-line overflow-hidden rounded-lg border border-line',
        tone === 'panel' ? 'bg-panel' : 'bg-surface',
      )}
    >
      {hits.map((h) => {
        const open = expanded.has(h.id);
        return (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => toggle(h.id)}
              aria-expanded={open}
              className={cn(
                'flex w-full items-start gap-2 px-3 py-2 text-left',
                tone === 'panel' ? 'hover:bg-surface' : 'hover:bg-panel',
              )}
            >
              <ChevronRight
                size={14}
                className={cn(
                  'mt-0.5 shrink-0 text-muted transition-transform',
                  open && 'rotate-90',
                )}
              />
              {/* Truncated for a clean collapsed row; wraps to the full question
                  once expanded. `title` gives the full text on hover meanwhile. */}
              <span
                className={cn('min-w-0 flex-1 text-sm font-medium text-ink', !open && 'truncate')}
                dir="auto"
                title={h.question}
              >
                {h.question}
              </span>
              <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink">
                {Math.round(h.similarity * 100)}% match
              </span>
            </button>
            {/* Topic + answer live in the expanded area, not the title row, for
                a cleaner collapsed list. Topic and the edit link share one row,
                pushed to opposite ends. */}
            {open && (
              <div className="px-3 pb-3 pl-[1.625rem]">
                <p className="text-sm text-muted" dir="auto">
                  {h.answer}
                </p>
                {(h.topic || entryHref) && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {h.topic ? (
                      <Badge tone="muted" shape="tag">
                        {h.topic}
                      </Badge>
                    ) : (
                      <span />
                    )}
                    {entryHref && (
                      <Link
                        to={entryHref(h.id)}
                        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
                      >
                        <Pencil size={12} />
                        Edit
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
