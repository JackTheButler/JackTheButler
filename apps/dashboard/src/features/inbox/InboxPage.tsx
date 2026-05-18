import { useState } from 'react';
import { conversations } from '@/mock/fixtures';
import { ConversationList } from './ConversationList';
import { Thread } from './Thread';
import { ContextPanel } from './ContextPanel';

/**
 * Mobile is a stacked drill-down: list → thread → profile. The thread and
 * profile are full-screen overlays that slide in from the right and back out.
 * Desktop shows all panes side by side (the `md:` classes reset the mobile
 * positioning/transform), so `mobileView` only affects < md.
 */
type MobileView = 'list' | 'thread' | 'profile';

export function InboxPage() {
  const [activeId, setActiveId] = useState(conversations[0].id);
  const [mobileView, setMobileView] = useState<MobileView>('list');
  const convo = conversations.find((c) => c.id === activeId) ?? conversations[0];

  return (
    <>
      <ConversationList
        items={conversations}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          setMobileView('thread');
        }}
      />
      <Thread
        convo={convo}
        mobileActive={mobileView !== 'list'}
        onBack={() => setMobileView('list')}
        onOpenProfile={() => setMobileView('profile')}
      />
      <ContextPanel
        convo={convo}
        mobileShow={mobileView === 'profile'}
        onBack={() => setMobileView('thread')}
      />
    </>
  );
}
