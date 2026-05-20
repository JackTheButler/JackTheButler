import { Bot, User, ChevronRight, ChevronLeft } from 'lucide-react';
import type { ConversationDetail, MessageDTO } from '@janetheoperator/shared';
import { MarkdownBody } from '@janetheoperator/widget-ui';
import { useIsWide } from '@/lib/useMediaQuery';
import { Button, cn } from '@/components/ui';
import { ChannelIcon, channelLabel } from './channel';
import { Composer } from './Composer';
import { relativeTime, customerLabel } from './format';

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function Bubble({ msg }: { msg: MessageDTO }) {
  if (msg.event || msg.author === 'system') {
    return <Divider label={msg.event ?? 'system'} />;
  }
  if (msg.author === 'customer') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[min(95%,600px)] rounded-xl rounded-tl-sm bg-surface px-3.5 py-2.5 text-sm ring-1 ring-line">
          {msg.content}
          <div className="mt-1 text-[10px] text-muted">{relativeTime(msg.createdAt)}</div>
        </div>
      </div>
    );
  }
  const isAi = msg.author === 'ai';
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          'max-w-[min(95%,600px)] rounded-xl rounded-tr-sm px-3.5 py-2.5 text-sm',
          isAi ? 'bg-accent text-on-accent' : 'bg-staff text-white',
        )}
      >
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
          {isAi ? <Bot size={11} /> : <User size={11} />} {isAi ? 'Jane AI' : 'You'}
        </div>
        {isAi ? <MarkdownBody>{msg.content}</MarkdownBody> : msg.content}
        <div className="mt-1 text-[10px] opacity-70">{relativeTime(msg.createdAt)}</div>
      </div>
    </div>
  );
}

export function Thread({
  convo,
  mobileActive = false,
  onBack,
  onOpenProfile,
  onTakeover,
  onHandback,
  onReply,
  onReopen,
  onClose,
}: {
  convo: ConversationDetail;
  mobileActive?: boolean;
  onBack?: () => void;
  onOpenProfile?: () => void;
  onTakeover: () => void;
  onHandback: () => void;
  onReply: (text: string) => void;
  onReopen: () => void;
  onClose: () => void;
}) {
  const isWide = useIsWide();
  const human = convo.mode === 'human';
  const name = customerLabel(convo.customer?.name);

  return (
    <section
      className={cn(
        'fixed inset-0 z-40 flex min-w-0 flex-col bg-panel transition-transform duration-300 ease-out md:static md:inset-auto md:z-auto md:flex-1 md:translate-x-0 md:transition-none',
        mobileActive
          ? 'translate-x-0'
          : 'pointer-events-none translate-x-full md:pointer-events-auto',
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-3 md:px-5">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to conversations"
          className="md:hidden"
        >
          <ChevronLeft size={20} />
        </Button>
        {isWide ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
              <ChannelIcon channel={convo.channel} />
              <span className="truncate">
                {channelLabel(convo.channel)} · #{convo.ref}
              </span>
            </span>
          </div>
        ) : (
          <button
            onClick={onOpenProfile}
            title="Show customer details"
            className="group -mx-2 flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{name}</span>
              <span className="flex min-w-0 items-center gap-1 text-xs font-normal text-muted">
                <ChannelIcon channel={convo.channel} />
                <span className="truncate">
                  {channelLabel(convo.channel)} · #{convo.ref}
                </span>
              </span>
            </span>
            <ChevronRight
              size={14}
              className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>
        )}
        {convo.status === 'open' && (
          <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={onClose}>
            Resolve
          </Button>
        )}
      </header>

      <div
        className={cn(
          'flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 md:px-5 md:py-5',
          human && 'bg-staff-soft/40',
        )}
      >
        {convo.messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
      </div>

      <footer className="border-t border-line px-3 py-3 md:px-5 md:py-4">
        {convo.status === 'closed' ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
            <span className="text-muted">This conversation is resolved.</span>
            <Button size="sm" onClick={onReopen}>
              Reopen
            </Button>
          </div>
        ) : (
          <Composer
            human={human}
            onTakeOver={onTakeover}
            onHandBack={onHandback}
            onSend={onReply}
          />
        )}
      </footer>
    </section>
  );
}
