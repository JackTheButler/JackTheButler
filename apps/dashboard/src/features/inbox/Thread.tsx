import { useEffect, useState } from 'react';
import { Bot, User, ChevronRight, ChevronLeft } from 'lucide-react';
import type { Conversation, Message } from '@/mock/fixtures';
import { useIsWide } from '@/lib/useMediaQuery';
import { IconButton } from '@/components/ui';
import { ChannelIcon, channelLabel } from './channel';
import { Composer } from './Composer';


function Bubble({ msg }: { msg: Message }) {
  if (msg.author === 'customer') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[88%] rounded-xl rounded-tl-sm bg-surface px-3.5 py-2.5 text-sm ring-1 ring-line sm:max-w-[78%] md:max-w-[68%]">
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
        className={`max-w-[88%] rounded-xl rounded-tr-sm px-3.5 py-2.5 text-sm sm:max-w-[78%] md:max-w-[68%] ${
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

export function Thread({
  convo,
  mobileActive = false,
  onBack,
  onOpenProfile,
}: {
  convo: Conversation;
  mobileActive?: boolean;
  onBack?: () => void;
  onOpenProfile?: () => void;
}) {
  const isWide = useIsWide();

  // Local handling state (mock — would set conversation mode server-side).
  // Reset to the conversation's own mode when switching chats.
  const [humanControlled, setHumanControlled] = useState(convo.mode === 'human');
  useEffect(() => {
    setHumanControlled(convo.mode === 'human');
  }, [convo.id, convo.mode]);

  return (
    <section
      className={`fixed inset-0 z-40 flex min-w-0 flex-col bg-panel transition-transform duration-300 ease-out md:static md:inset-auto md:z-auto md:flex-1 md:translate-x-0 md:transition-none ${
        mobileActive ? 'translate-x-0' : 'translate-x-full pointer-events-none md:pointer-events-auto'
      }`}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-3 md:px-5">
        <IconButton onClick={onBack} aria-label="Back to conversations" className="md:hidden">
          <ChevronLeft size={20} />
        </IconButton>
        {isWide ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{convo.customer}</span>
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
              <ChannelIcon channel={convo.channel} />
              <span className="truncate">
                {channelLabel(convo.channel)} · {convo.ref}
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
              <span className="truncate text-sm font-semibold">{convo.customer}</span>
              <span className="flex min-w-0 items-center gap-1 text-xs font-normal text-muted">
                <ChannelIcon channel={convo.channel} />
                <span className="truncate">
                  {channelLabel(convo.channel)} · {convo.ref}
                </span>
              </span>
            </span>
            <ChevronRight
              size={14}
              className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>
        )}
      </header>

      <div
        className={`flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 md:px-5 md:py-5 ${
          humanControlled ? 'bg-staff-soft/40' : ''
        }`}
      >
        {convo.messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
      </div>

      <footer className="border-t border-line px-3 py-3 md:px-5 md:py-4">
        <Composer
          human={humanControlled}
          onTakeOver={() => setHumanControlled(true)}
          onHandBack={() => setHumanControlled(false)}
        />
      </footer>
    </section>
  );
}
