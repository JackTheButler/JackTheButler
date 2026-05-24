import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { KnowledgeHitDTO } from '@janetheoperator/shared';
import { Loading } from '@/components/Loading';
import { ConversationList } from './ConversationList';
import { Thread } from './Thread';
import { ContextPanel } from './ContextPanel';
import { KnowledgePanel } from './KnowledgePanel';
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
  // Retrieval-transparency panel: the entries of the AI message whose knowledge
  // trigger was tapped. `hits` is retained while closing so the slide-out keeps
  // its content.
  const [knowledgeHits, setKnowledgeHits] = useState<KnowledgeHitDTO[]>([]);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const list = useConversationList(undefined);
  const items = list.data?.conversations ?? [];

  // Deep link from a tapped push notification (?c=<id>): open that thread, then
  // drop the param so it doesn't override later manual selection.
  const deepLinkId = searchParams.get('c');
  useEffect(() => {
    if (!deepLinkId) return;
    setActiveId(deepLinkId);
    setMobileView('thread');
    setSearchParams(
      (p) => {
        p.delete('c');
        return p;
      },
      { replace: true },
    );
  }, [deepLinkId, setSearchParams]);

  // Default selection once the list arrives.
  useEffect(() => {
    if (!activeId && items.length) setActiveId(items[0].id);
  }, [activeId, items]);

  // Close the knowledge panel when switching conversations (its hits are stale).
  useEffect(() => setKnowledgeOpen(false), [activeId]);

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
            onShowKnowledge={(hits) => {
              setKnowledgeHits(hits);
              setKnowledgeOpen(true);
            }}
          />
          <ContextPanel
            convo={convo}
            mobileShow={mobileView === 'profile'}
            onBack={() => setMobileView('thread')}
          />
          <KnowledgePanel
            hits={knowledgeHits}
            open={knowledgeOpen}
            onClose={() => setKnowledgeOpen(false)}
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
