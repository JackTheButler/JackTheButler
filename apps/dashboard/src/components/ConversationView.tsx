import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  id: string;
}

interface ConversationDetails {
  id: string;
  channelType: string;
  channelId: string;
  state: string;
  guestId: string | null;
  guestName?: string;
  assignedTo: string | null;
  assignedName?: string;
  currentIntent: string | null;
  messageCount: number;
  createdAt: string;
}

interface Message {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  senderType: 'guest' | 'ai' | 'staff' | 'system';
  senderId: string | null;
  content: string;
  contentType: string;
  intent: string | null;
  createdAt: string;
}

export function ConversationView({ id }: Props) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: convData } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.get<{ conversation: ConversationDetails }>(`/conversations/${id}`),
  });

  const { data: msgData, isLoading: loadingMessages } = useQuery({
    queryKey: ['messages', id],
    queryFn: () => api.get<{ messages: Message[] }>(`/conversations/${id}/messages`),
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/conversations/${id}/messages`, { content, contentType: 'text' }),
    onSuccess: () => {
      setInput('');
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const conv = convData?.conversation;
  const messages = msgData?.messages || [];

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMutation.mutate(input.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!conv) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-gray-900">
              {conv.guestName || conv.channelId}
            </h2>
            <p className="text-sm text-gray-500">
              {conv.channelType} · {conv.state}
              {conv.currentIntent && ` · ${conv.currentIntent}`}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingMessages ? (
          <div className="text-center text-gray-500">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500">No messages yet</div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={sendMutation.isPending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isInbound = message.direction === 'inbound';

  const senderLabel = {
    guest: 'Guest',
    ai: 'Jack (AI)',
    staff: 'Staff',
    system: 'System',
  }[message.senderType];

  return (
    <div className={cn('flex', isInbound ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[70%] rounded-lg px-3 py-2',
          isInbound ? 'bg-gray-100' : 'bg-blue-600 text-white',
          message.senderType === 'ai' && !isInbound && 'bg-green-600'
        )}
      >
        <div
          className={cn(
            'text-xs mb-1',
            isInbound ? 'text-gray-500' : 'text-white/70'
          )}
        >
          {senderLabel}
        </div>
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
        <div
          className={cn(
            'text-xs mt-1',
            isInbound ? 'text-gray-400' : 'text-white/60'
          )}
        >
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
