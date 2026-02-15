import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getConversationStateFilters } from '@/lib/config';
import { ConversationList, ConversationView } from '@/components';
import { ConversationListSkeleton } from '@/components';
import { FilterTabs } from '@/components/ui/filter-tabs';
import type { Conversation, ConversationState } from '@/types/api';

export function ConversationsPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ConversationState | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['conversations', filter],
    queryFn: () => {
      const params = filter !== 'all' ? `?state=${filter}` : '';
      return api.get<{ conversations: Conversation[] }>(`/conversations${params}`);
    },
    refetchInterval: 10000,
  });

  const conversations = data?.conversations || [];

  const conversationStateFilters = getConversationStateFilters(t);

  return (
    <div className={cn('flex h-[calc(100vh-56px)]', selectedId && 'max-md:fixed max-md:inset-0 max-md:h-screen max-md:z-40 max-md:bg-background')}>
      {/* Sidebar */}
      <div className={`w-full md:w-80 border-e bg-card flex-col ${selectedId ? 'hidden md:flex' : 'flex'}`}>
        {/* Filters */}
        <div className="p-3 border-b">
          <FilterTabs
            options={conversationStateFilters}
            value={filter}
            onChange={setFilter}
          />
        </div>

        {/* List */}
        {isLoading ? (
          <ConversationListSkeleton count={6} />
        ) : conversations.length === 0 ? (
          <div className="p-4 text-muted-foreground text-sm">{t('inbox.noConversations')}</div>
        ) : (
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </div>

      {/* Main */}
      <div className={`flex-1 min-w-0 w-full ${selectedId ? 'flex flex-col' : 'hidden md:flex md:items-center md:justify-center'} ${selectedId ? 'bg-background' : 'bg-muted/50'}`}>
        {selectedId ? (
          <ConversationView id={selectedId} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            {t('inbox.selectConversation')}
          </div>
        )}
      </div>
    </div>
  );
}
