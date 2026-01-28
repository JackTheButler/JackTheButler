import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  channelType: string;
  channelId: string;
  state: string;
  guestId: string | null;
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

const channelIcons: Record<string, string> = {
  whatsapp: 'WA',
  sms: 'SMS',
  webchat: 'Web',
  email: 'Email',
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
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">
                {channelIcons[conv.channelType] || conv.channelType}
              </span>
              <span className={cn('text-xs px-1.5 py-0.5 rounded', stateColors[conv.state])}>
                {conv.state}
              </span>
            </div>
            <span className="text-xs text-gray-400">
              {conv.messageCount} msgs
            </span>
          </div>
          <div className="text-sm font-medium text-gray-900 truncate">
            {formatChannelId(conv.channelType, conv.channelId)}
          </div>
          {conv.currentIntent && (
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {conv.currentIntent}
            </div>
          )}
          {conv.lastMessageAt && (
            <div className="text-xs text-gray-400 mt-1">
              {formatTime(conv.lastMessageAt)}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function formatChannelId(channel: string, id: string): string {
  if (channel === 'whatsapp' || channel === 'sms') {
    // Format phone number
    if (id.length > 6) {
      return `+${id.slice(0, -4)}****`;
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
