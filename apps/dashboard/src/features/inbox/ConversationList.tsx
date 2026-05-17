import { useState } from 'react';
import type { Conversation } from '@/mock/fixtures';
import { ChannelIcon } from './channel';

const FILTERS = ['All', 'AI', 'Mine', 'Unassigned'] as const;

export function ConversationList({
  items,
  activeId,
  onSelect,
}: {
  items: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');

  return (
    <aside className="flex w-full shrink-0 flex-col border-r border-line bg-panel md:w-80">
      <div className="border-b border-line px-3 py-3 md:px-4">
        <h1 className="text-sm font-semibold">Conversations</h1>
        <div className="mt-3 flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                f === filter ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.map((c) => {
          const on = c.id === activeId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`flex w-full flex-col gap-1 border-b border-line px-3 py-3 text-left transition-colors md:px-4 ${
                on ? 'bg-accent-soft/60' : 'hover:bg-surface'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    c.unread ? 'bg-accent' : 'bg-transparent'
                  }`}
                />
                <span className="flex-1 truncate text-sm font-semibold">{c.customer}</span>
                <span className="text-xs text-muted">{c.time}</span>
              </div>
              <p className="line-clamp-1 pl-4 text-xs text-muted">{c.snippet}</p>
              <div className="flex items-center gap-2 pl-4 pt-0.5">
                <ChannelIcon channel={c.channel} />
                <span className="text-[11px] text-muted">{c.ref}</span>
                <span className="ml-auto" />
                {c.mode === 'human' && (
                  <span className="rounded-md bg-staff-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-staff">
                    Human
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
