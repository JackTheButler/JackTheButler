import { cn } from '@/lib/utils';
import { ChannelIcon } from '@/components/shared/ChannelIcon';

interface Conversation {
  id: string;
  channelType: string;
  channelId: string;
  state: string;
  guestId: string | null;
  guestName?: string;
  currentIntent: string | null;
  lastMessageAt: string | null;
  messageCount: number;
}

interface Props {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const stateColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  escalated: 'bg-red-100 text-red-700',
  resolved: 'bg-gray-100 text-gray-600',
  closed: 'bg-gray-100 text-gray-500',
};

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
                {formatTime(conv.lastMessageAt)}
              </span>
            )}
          </div>
          {/* Bottom row: Icon + msgs | State */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-gray-500">
              <ChannelIcon channel={conv.channelType} size="sm" />
              <span className="text-xs">{conv.messageCount} msgs</span>
            </div>
            <span className={cn('text-xs px-1.5 py-0.5 rounded', stateColors[conv.state])}>
              {conv.state}
            </span>
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

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return date.toLocaleDateString();
}
