import { useState } from 'react';
import type { Conversation } from '@/mock/fixtures';
import { Badge, EmptyState, SegmentedControl, cn } from '@/components/ui';

const FILTERS = ['Open', 'All', 'Human', 'AI', 'Resolved'] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(c: Conversation, filter: Filter): boolean {
  switch (filter) {
    case 'Open':
      return c.status === 'needs_reply';
    case 'All':
      return true;
    case 'Human':
      return c.mode === 'human' && c.status !== 'resolved';
    case 'AI':
      return c.mode === 'ai' && c.status !== 'resolved';
    case 'Resolved':
      return c.status === 'resolved';
  }
}

export function ConversationList({
  items,
  activeId,
  onSelect,
}: {
  items: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('Open');
  const visible = items.filter((c) => matchesFilter(c, filter));

  return (
    <aside className="flex w-full shrink-0 flex-col border-r border-line bg-panel md:w-80">
      <div className="border-b border-line px-3 py-3 md:px-4">
        <h1 className="text-sm font-semibold">Inbox</h1>
        <SegmentedControl
          aria-label="Filter conversations"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
          className="-mx-3 mt-3 px-3 md:-mx-4 md:px-4"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <EmptyState>No conversations here.</EmptyState>
        )}
        {visible.map((c) => {
          const on = c.id === activeId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                'flex w-full flex-col gap-1 border-b border-line px-3 py-3 text-left transition-colors md:px-4',
                on ? 'bg-accent-soft/60' : 'hover:bg-surface',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    c.unread ? 'bg-accent' : 'bg-transparent',
                  )}
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
