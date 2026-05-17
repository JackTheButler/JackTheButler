import type { ReactNode } from 'react';
import { Mail, Hash, MessageSquare } from 'lucide-react';
import type { Conversation } from '@/mock/fixtures';
import { useContextPanel } from '@/lib/contextPanel';
import { useIsWide } from '@/lib/useMediaQuery';
import { channelLabel } from './channel';

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span className="text-muted">{icon}</span>
      <span className="w-20 text-xs text-muted">{label}</span>
      <span className="flex-1 truncate font-medium">{value}</span>
    </div>
  );
}

export function ContextPanel({ convo }: { convo: Conversation }) {
  const { open } = useContextPanel();
  const isWide = useIsWide();
  const shown = isWide || open; // always shown on wide screens
  return (
    <aside
      className={`shrink-0 overflow-hidden bg-panel transition-[width] duration-200 ease-out ${
        shown ? 'w-72 border-l border-line' : 'w-0'
      }`}
    >
      <div className="h-full w-72 overflow-y-auto px-4 py-4">
        <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
          {convo.customer.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-semibold">{convo.customer}</div>
          <div className="text-xs text-muted">Customer</div>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <Row icon={<Mail size={14} />} label="Email" value={convo.email} />
        <Row icon={<MessageSquare size={14} />} label="Channel" value={channelLabel(convo.channel)} />
        <Row icon={<Hash size={14} />} label="Ref" value={convo.ref} />
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Knowledge used
        </h3>
        <div className="flex flex-col gap-1.5">
          {convo.kbHits.map((k) => (
            <div
              key={k.title}
              className="flex items-center justify-between rounded-lg bg-surface px-2.5 py-2 text-xs ring-1 ring-line"
            >
              <span className="truncate pr-2">{k.title}</span>
              <span className="shrink-0 font-mono text-[10px] text-accent">
                {k.score.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        </div>
      </div>
    </aside>
  );
}
