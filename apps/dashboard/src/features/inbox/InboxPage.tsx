import { useEffect, useState } from 'react';
import { Loading } from '@/components/Loading';
import { ConversationList } from './ConversationList';
import { Thread } from './Thread';
import { ContextPanel } from './ContextPanel';
import {
  useConversationList,
  useConversation,
  useTakeover,
  useHandback,
  useReply,
  useClose,
  useReopen,
  notifyTyping,
} from './useConversations';

type MobileView = 'list' | 'thread' | 'profile';

export function InboxPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>('list');

  const list = useConversationList(undefined);
  const items = list.data?.conversations ?? [];

  // Default selection once the list arrives.
  useEffect(() => {
    if (!activeId && items.length) setActiveId(items[0].id);
  }, [activeId, items]);

  const detail = useConversation(activeId);
  const convo = detail.data;

  const takeover = useTakeover();
  const handback = useHandback();
  const reply = useReply();
  const close = useClose();
  const reopen = useReopen();

  return (
    <>
      <ConversationList
        items={items}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          setMobileView('thread');
        }}
      />

      {convo ? (
        <>
          <Thread
            convo={convo}
            mobileActive={mobileView !== 'list'}
            onBack={() => setMobileView('list')}
            onOpenProfile={() => setMobileView('profile')}
            onTakeover={() => activeId && takeover.mutate(activeId)}
            onHandback={() => activeId && handback.mutate(activeId)}
            onReply={(text) => activeId && reply.mutate({ id: activeId, content: text })}
            onTyping={() => activeId && notifyTyping(activeId)}
            onReopen={() => activeId && reopen.mutate(activeId)}
            onClose={() => activeId && close.mutate(activeId)}
          />
          <ContextPanel
            convo={convo}
            mobileShow={mobileView === 'profile'}
            onBack={() => setMobileView('thread')}
          />
        </>
      ) : (
        <section className="hidden flex-1 items-center justify-center md:flex">
          {list.isLoading ? (
            <Loading />
          ) : (
            <span className="text-sm text-muted">Select a conversation</span>
          )}
        </section>
      )}
    </>
  );
}
