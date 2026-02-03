import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
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
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <div className="w-80 border-r bg-card flex flex-col">
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
      <div className="flex-1 bg-muted">
        {selectedId ? (
          <ConversationView id={selectedId} />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            {t('inbox.selectConversation')}
          </div>
        )}
      </div>
    </div>
  );
}
