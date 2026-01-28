import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ConversationList } from '@/components/ConversationList';
import { ConversationView } from '@/components/ConversationView';

type ConversationState = 'new' | 'active' | 'escalated' | 'resolved' | 'closed';

interface Conversation {
  id: string;
  channelType: string;
  channelId: string;
  state: ConversationState;
  guestId: string | null;
  assignedTo: string | null;
  currentIntent: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  messageCount: number;
}

const states: { value: ConversationState | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
];

export function ConversationsPage() {
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

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <div className="w-80 border-r bg-white flex flex-col">
        {/* Filters */}
        <div className="p-3 border-b flex gap-1">
          {states.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilter(s.value)}
              className={`px-3 py-1 text-sm rounded ${
                filter === s.value
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="p-4 text-gray-500 text-sm">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-gray-500 text-sm">No conversations</div>
        ) : (
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </div>

      {/* Main */}
      <div className="flex-1 bg-gray-50">
        {selectedId ? (
          <ConversationView id={selectedId} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}
