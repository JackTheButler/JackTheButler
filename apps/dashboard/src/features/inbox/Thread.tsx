import { Bot, User, Send, ChevronRight } from 'lucide-react';
import type { Conversation, Message } from '@/mock/fixtures';
import { useContextPanel } from '@/lib/contextPanel';
import { useIsWide } from '@/lib/useMediaQuery';
import { ChannelIcon, channelLabel } from './channel';

function HandoffPill({ mode }: { mode: Conversation['mode'] }) {
  if (mode === 'ai') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
          <Bot size={14} /> AI handling
        </span>
        <button className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition-opacity hover:opacity-90">
          Take over
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink ring-1 ring-line">
        <User size={14} /> You're handling
      </span>
      <button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-accent ring-1 ring-accent/40 transition-colors hover:bg-accent-soft">
        Hand back to AI
      </button>
    </div>
  );
}

function Bubble({ msg }: { msg: Message }) {
  if (msg.author === 'customer') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[68%] rounded-xl rounded-tl-sm bg-surface px-3.5 py-2.5 text-sm ring-1 ring-line">
          {msg.content}
          <div className="mt-1 text-[10px] text-muted">{msg.time}</div>
        </div>
      </div>
    );
  }
  const isAi = msg.author === 'ai';
  return (
    <div className="flex justify-end">
      <div
        className={`max-w-[68%] rounded-xl rounded-tr-sm px-3.5 py-2.5 text-sm ${
          isAi ? 'bg-accent text-on-accent' : 'bg-staff text-white'
        }`}
      >
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
          {isAi ? <Bot size={11} /> : <User size={11} />} {isAi ? 'Jane AI' : 'You'}
        </div>
        {msg.content}
        <div className="mt-1 text-[10px] opacity-70">{msg.time}</div>
      </div>
    </div>
  );
}

export function Thread({ convo }: { convo: Conversation }) {
  const aiHandling = convo.mode === 'ai';
  const { open: panelOpen, toggle: togglePanel } = useContextPanel();
  const isWide = useIsWide();
  return (
    <section className="flex flex-1 flex-col bg-panel">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        {isWide ? (
          <div className="flex items-center gap-2 px-0 py-1 text-sm font-semibold">
            {convo.customer}
            <span className="text-muted">·</span>
            <span className="inline-flex items-center gap-1 text-xs font-normal text-muted">
              <ChannelIcon channel={convo.channel} /> {channelLabel(convo.channel)} {convo.ref}
            </span>
          </div>
        ) : (
          <button
            onClick={togglePanel}
            aria-expanded={panelOpen}
            title={panelOpen ? 'Hide customer details' : 'Show customer details'}
            className="group -mx-2 flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold transition-colors hover:bg-surface"
          >
            {convo.customer}
            <span className="text-muted">·</span>
            <span className="inline-flex items-center gap-1 text-xs font-normal text-muted">
              <ChannelIcon channel={convo.channel} /> {channelLabel(convo.channel)} {convo.ref}
            </span>
            <ChevronRight
              size={14}
              className={`text-muted opacity-0 transition-all group-hover:opacity-100 ${
                panelOpen ? 'rotate-90' : ''
              }`}
            />
          </button>
        )}
        <HandoffPill mode={convo.mode} />
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-5">
        {convo.messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
      </div>

      <footer className="border-t border-line px-5 py-4">
        <div
          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
            aiHandling ? 'border-line bg-surface' : 'border-accent/30 bg-panel'
          }`}
        >
          <input
            disabled={aiHandling}
            placeholder={
              aiHandling ? 'AI is handling — take over to reply' : 'Type a reply…'
            }
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
          <button
            disabled={aiHandling}
            className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-on-accent disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </div>
      </footer>
    </section>
  );
}
