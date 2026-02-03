import { MessageSquare, ListTodo } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={cn(
            'w-full p-3 text-start border-b hover:bg-muted transition-colors',
            selectedId === conv.id && 'bg-accent'
          )}
        >
          {/* Top row: Icon + Name | Time */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground truncate">
              <ChannelIcon channel={conv.channelType} size="sm" boxed />
              {conv.guestName || formatChannelId(conv.channelType, conv.channelId)}
            </div>
            {conv.lastMessageAt && (
              <span className="text-xs text-muted-foreground ms-2 shrink-0">
                {formatTimeAgo(conv.lastMessageAt, t)}
              </span>
            )}
          </div>
          {/* Bottom row: msgs + tasks | State */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="flex items-center gap-0.5 text-xs bg-muted px-1.5 py-0.5 rounded-md">
                <MessageSquare className="w-3 h-3" />
                {conv.messageCount}
              </span>
              {(conv.taskCount ?? 0) > 0 && (
                <span className="flex items-center gap-0.5 text-xs bg-muted px-1.5 py-0.5 rounded-md">
                  <ListTodo className="w-3 h-3" />
                  {conv.taskCount}
                </span>
              )}
            </div>
            <Badge variant={conversationStateVariants[conv.state] || 'default'}>
              {t(`conversations.states.${conv.state}`)}
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

