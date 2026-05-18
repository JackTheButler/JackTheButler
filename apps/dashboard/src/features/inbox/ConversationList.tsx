import { useState } from 'react';
import type { Conversation } from '@/mock/fixtures';
import { Badge, SegmentedControl } from '@/components/ui';

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
        <h1 className="text-sm font-semibold">Inbox</h1>
        <SegmentedControl
          aria-label="Filter conversations"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
          className="mt-3"
        />
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
                {c.mode === 'human' && <Badge tone="staff">Human</Badge>}
                <span className="shrink-0 text-xs text-muted">{c.time}</span>
              </div>
              <p className="line-clamp-1 pl-4 text-xs text-muted">{c.snippet}</p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
