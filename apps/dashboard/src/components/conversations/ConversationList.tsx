import { MessageSquare, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/formatters';
import { conversationStateVariants } from '@/lib/config';
import { ChannelIcon } from '@/components/shared/ChannelIcon';
import { Badge } from '@/components/ui/badge';
import type { Conversation } from '@/types/api';

interface Props {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ conversations, selectedId, onSelect }: Props) {
  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={cn(
            'w-full p-3 text-left border-b hover:bg-gray-50 transition-colors',
            selectedId === conv.id && 'bg-blue-50'
          )}
        >
          {/* Top row: Name | Time */}
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-medium text-gray-900 truncate">
              {conv.guestName || formatChannelId(conv.channelType, conv.channelId)}
            </div>
            {conv.lastMessageAt && (
              <span className="text-xs text-gray-400 ml-2 shrink-0">
                {formatTimeAgo(conv.lastMessageAt)}
              </span>
            )}
          </div>
          {/* Bottom row: Icon + msgs + tasks | State */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-gray-500">
              <ChannelIcon channel={conv.channelType} size="sm" />
              <span className="flex items-center gap-0.5 text-xs bg-gray-100 px-1.5 py-0.5 rounded-md">
                <MessageSquare className="w-3 h-3" />
                {conv.messageCount}
              </span>
              {(conv.taskCount ?? 0) > 0 && (
                <span className="flex items-center gap-0.5 text-xs bg-gray-100 px-1.5 py-0.5 rounded-md">
                  <ListTodo className="w-3 h-3" />
                  {conv.taskCount}
                </span>
              )}
            </div>
            <Badge variant={conversationStateVariants[conv.state] || 'default'}>
              {conv.state}
            </Badge>
          </div>
        </button>
      ))}
    </div>
  );
}

function formatChannelId(channel: string, id: string): string {
  if (channel === 'whatsapp' || channel === 'sms') {
    // Format phone number (mask last 4 digits)
    if (id.length > 6) {
      const prefix = id.startsWith('+') ? '' : '+';
      return `${prefix}${id.slice(0, -4)}****`;
    }
  }
  return id;
}

