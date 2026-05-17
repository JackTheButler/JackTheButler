import type { ReactNode } from 'react';
import { Mail, Hash, MessageSquare, ChevronLeft } from 'lucide-react';
import type { Conversation } from '@/mock/fixtures';
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

/** Panel contents, shared by the desktop column and the slide-over overlay. */
function ContextBody({ convo }: { convo: Conversation }) {
  return (
    <div className="px-3 py-4 md:px-4">
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
              <span className="shrink-0 font-mono text-[10px] text-accent">{k.score.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ContextPanel({
  convo,
  mobileShow = false,
  onBack,
}: {
  convo: Conversation;
  mobileShow?: boolean;
  onBack?: () => void;
}) {
  return (
    <>
      {/* ≥ xl only: always-open side column (room exists, no squish) */}
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-line bg-panel xl:block">
        <ContextBody convo={convo} />
      </aside>

      {/* Backdrop — medium range only (mobile is a full-screen takeover) */}
      <div
        onClick={onBack}
        className={`fixed inset-0 z-40 hidden bg-black/40 transition-opacity duration-300 md:block xl:hidden ${
          mobileShow ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Slide-over from the right: full-width on mobile, a side panel on md+ */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-panel transition-transform duration-300 ease-out md:w-[26rem] md:border-l md:border-line xl:hidden ${
          mobileShow ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        <header className="flex items-center gap-2 border-b border-line px-3 py-3">
          <button
            onClick={onBack}
            aria-label="Back to conversation"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface hover:text-ink"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm font-semibold">Customer details</span>
        </header>
        <div className="flex-1 overflow-y-auto">
          <ContextBody convo={convo} />
        </div>
      </div>
    </>
  );
}
