import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { KnowledgeHitDTO } from '@janetheoperator/shared';
import { Loading } from '@/components/Loading';
import { ConversationList } from './ConversationList';
import { Thread } from './Thread';
import { ContextPanel } from './ContextPanel';
import { KnowledgePanel } from './KnowledgePanel';
import { CopilotPanel } from './CopilotPanel';
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
  const [copilotOpen, setCopilotOpen] = useState(false);
  // The text the copilot search opens with — the customer's last message by
  // default, or a specific message when launched from its sparkle shortcut.
  const [copilotQuery, setCopilotQuery] = useState('');
  // Copilot-generated reply to drop into the composer (new object each time).
  const [composerPrefill, setComposerPrefill] = useState<{ text: string } | null>(null);
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

  // Close the side panels + drop any pending copilot draft when switching
  // conversations (their data is stale).
  useEffect(() => {
    setKnowledgeOpen(false);
    setCopilotOpen(false);
    setComposerPrefill(null);
  }, [activeId]);

  const detail = useConversation(activeId);
  const convo = detail.data;

  // Prefill the copilot search with the customer's last message (default-language
  // version when they wrote in another language).
  const lastCustomerMessage = convo
    ? [...convo.messages].reverse().find((m) => m.author === 'customer')
    : undefined;
  const copilotPrefill = lastCustomerMessage?.translation ?? lastCustomerMessage?.content;

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
            onReply={(text, translate) =>
              activeId && reply.mutate({ id: activeId, content: text, translate })
            }
            onTyping={() => activeId && notifyTyping(activeId)}
            onReopen={() => activeId && reopen.mutate(activeId)}
            onClose={() => activeId && close.mutate(activeId)}
            onShowKnowledge={(hits) => {
              setKnowledgeHits(hits);
              setKnowledgeOpen(true);
            }}
            onAskCopilot={(query) => {
              setCopilotQuery(query ?? copilotPrefill ?? '');
              setCopilotOpen(true);
            }}
            composerPrefill={composerPrefill}
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
          <CopilotPanel
            open={copilotOpen}
            onClose={() => setCopilotOpen(false)}
            lastCustomerMessage={copilotQuery}
            onGenerate={(text) => {
              setComposerPrefill({ text });
              setCopilotOpen(false);
            }}
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
