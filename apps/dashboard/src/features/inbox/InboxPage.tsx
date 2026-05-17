import { useState } from 'react';
import { IconRail } from '@/components/IconRail';
import { conversations } from '@/mock/fixtures';
import { ConversationList } from './ConversationList';
import { Thread } from './Thread';
import { ContextPanel } from './ContextPanel';

export function InboxPage() {
  const [activeId, setActiveId] = useState(conversations[0].id);
  const convo = conversations.find((c) => c.id === activeId) ?? conversations[0];

  return (
    <div className="flex h-full">
      <IconRail active="inbox" />
      <ConversationList items={conversations} activeId={activeId} onSelect={setActiveId} />
      <Thread convo={convo} />
      <ContextPanel convo={convo} />
    </div>
  );
}
