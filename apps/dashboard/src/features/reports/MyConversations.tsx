import { useMemo } from 'react';
import { cn } from '@/components/ui';
import { myOpenConversations, type Agent, type SlaState } from './mock';
import { Panel } from './primitives';

const SLA_BADGE: Record<SlaState, { label: string; cls: string }> = {
  ok: { label: 'On track', cls: 'bg-surface text-muted' },
  'at-risk': { label: 'At risk', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  breached: { label: 'Breached', cls: 'bg-rose-500/12 text-rose-600' },
};

/** The selected agent's open queue, oldest-first, with SLA state flagged so the
 *  top of the list is the most urgent. */
export function MyConversations({ agent }: { agent: Agent }) {
  const items = useMemo(() => myOpenConversations(agent), [agent]);
  return (
    <Panel title="My open conversations" subtitle="Oldest first — work from the top">
      <ul className="-my-1">
        {items.map((c) => {
          const b = SLA_BADGE[c.sla];
          return (
            <li
              key={c.id}
              className="flex items-center gap-3 border-b border-line/60 py-2.5 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{c.customer}</span>
                  <span className="shrink-0 text-[11px] text-muted">{c.channel}</span>
                </div>
                <p className="truncate text-xs text-muted">{c.snippet}</p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted">{c.waitingMin}m</span>
              <span
                className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', b.cls)}
              >
                {b.label}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
