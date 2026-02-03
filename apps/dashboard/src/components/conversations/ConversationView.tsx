import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ListTodo, Wrench, Sparkles, ConciergeBell, UtensilsCrossed, HelpCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatTime, formatDateTime } from '@/lib/formatters';
import { priorityVariants, taskStatusVariants } from '@/lib/config';
import type { Task } from '@/types/api';
import { DrawerRoot, DrawerContent } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
  const [stateMenuOpen, setStateMenuOpen] = useState(false);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stateMenuRef = useRef<HTMLDivElement>(null);

  const { data: convData } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.get<{ conversation: ConversationDetails }>(`/conversations/${id}`),
  });

  const { data: msgData, isLoading: loadingMessages } = useQuery({
    queryKey: ['messages', id],
    queryFn: () => api.get<{ messages: Message[] }>(`/conversations/${id}/messages`),
    refetchInterval: 5000,
  });

  const { data: taskData } = useQuery({
    queryKey: ['tasks', 'conversation', id],
    queryFn: () => api.get<{ tasks: Task[] }>(`/tasks?conversationId=${id}`),
    refetchInterval: 10000,
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

  const updateStateMutation = useMutation({
    mutationFn: (state: string) =>
      api.patch(`/conversations/${id}`, { state }),
    onSuccess: () => {
      setStateMenuOpen(false);
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversationStats'] });
    },
  });

  const claimTaskMutation = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/claim`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'conversation', id] });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/complete`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'conversation', id] });
    },
  });

  // Close state menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stateMenuRef.current && !stateMenuRef.current.contains(event.target as Node)) {
        setStateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const conv = convData?.conversation;
  const messages = msgData?.messages || [];
  const tasks = taskData?.tasks || [];

  // Create a map of messageId -> tasks
  const tasksByMessageId = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (task.messageId) {
        const existing = map.get(task.messageId) || [];
        existing.push(task);
        map.set(task.messageId, existing);
      }
    }
    return map;
  }, [tasks]);

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
          <div className="relative" ref={stateMenuRef}>
            <button
              onClick={() => setStateMenuOpen(!stateMenuOpen)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors',
                conv.state === 'escalated'
                  ? 'bg-orange-50 border-orange-200 text-orange-700'
                  : conv.state === 'resolved'
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : conv.state === 'closed'
                  ? 'bg-gray-50 border-gray-200 text-gray-500'
                  : 'bg-blue-50 border-blue-200 text-blue-700'
              )}
            >
              <span className="capitalize">{conv.state}</span>
              <ChevronDown size={14} className={cn('transition-transform', stateMenuOpen && 'rotate-180')} />
            </button>

            {stateMenuOpen && (
              <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50">
                {(conv.state === 'active' || conv.state === 'new') && (
                  <button
                    onClick={() => updateStateMutation.mutate('escalated')}
                    disabled={updateStateMutation.isPending}
                    className="w-full px-3 py-2 text-left text-sm text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                  >
                    Escalate
                  </button>
                )}
                {conv.state === 'escalated' && (
                  <button
                    onClick={() => updateStateMutation.mutate('active')}
                    disabled={updateStateMutation.isPending}
                    className="w-full px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    De-escalate
                  </button>
                )}
                {conv.state !== 'resolved' && conv.state !== 'closed' && (
                  <button
                    onClick={() => updateStateMutation.mutate('resolved')}
                    disabled={updateStateMutation.isPending}
                    className="w-full px-3 py-2 text-left text-sm text-green-700 hover:bg-green-50 disabled:opacity-50"
                  >
                    Resolve
                  </button>
                )}
                {(conv.state === 'resolved' || conv.state === 'closed') && (
                  <button
                    onClick={() => updateStateMutation.mutate('active')}
                    disabled={updateStateMutation.isPending}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Reopen
                  </button>
                )}
              </div>
            )}
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
          messages.map((msg) => {
            const messageTasks = tasksByMessageId.get(msg.id) || [];
            return (
              <div key={msg.id}>
                <MessageBubble message={msg} />
                {messageTasks.length > 0 && (
                  <TaskIndicator
                    tasks={messageTasks}
                    isInbound={msg.direction === 'inbound'}
                    onClick={() => setTaskDrawerOpen(true)}
                  />
                )}
              </div>
            );
          })
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
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
          >
            Send
          </Button>
        </div>
      </div>

      {/* Tasks Drawer */}
      <DrawerRoot open={taskDrawerOpen} onOpenChange={setTaskDrawerOpen}>
        <DrawerContent title={`Tasks (${tasks.length})`}>
          <div className="p-4 space-y-3">
            {tasks.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No tasks for this conversation</p>
            ) : (
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClaim={() => claimTaskMutation.mutate(task.id)}
                  onComplete={() => completeTaskMutation.mutate(task.id)}
                  isClaimPending={claimTaskMutation.isPending}
                  isCompletePending={completeTaskMutation.isPending}
                />
              ))
            )}
          </div>
        </DrawerContent>
      </DrawerRoot>
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

function TaskIndicator({
  tasks,
  isInbound,
  onClick,
}: {
  tasks: Task[];
  isInbound: boolean;
  onClick: () => void;
}) {
  const statusTextColors: Record<string, string> = {
    pending: 'text-yellow-600',
    in_progress: 'text-yellow-600',
    completed: 'text-green-600',
    cancelled: 'text-gray-400',
  };

  return (
    <div className={cn('flex mt-1', isInbound ? 'justify-start' : 'justify-end')}>
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
      >
        <ListTodo className="w-3 h-3" />
        <span>
          {tasks.length} task{tasks.length > 1 ? 's' : ''} created
        </span>
        {tasks.map((task) => (
          <span
            key={task.id}
            className={cn('capitalize', statusTextColors[task.status] || 'text-gray-500')}
          >
            ({task.status.replace('_', ' ')})
          </span>
        ))}
      </button>
    </div>
  );
}

const taskTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  housekeeping: Sparkles,
  maintenance: Wrench,
  concierge: ConciergeBell,
  room_service: UtensilsCrossed,
  other: HelpCircle,
};

function TaskCard({
  task,
  onClaim,
  onComplete,
  isClaimPending,
  isCompletePending,
}: {
  task: Task;
  onClaim: () => void;
  onComplete: () => void;
  isClaimPending: boolean;
  isCompletePending: boolean;
}) {
  const Icon = taskTypeIcons[task.type] || HelpCircle;

  return (
    <div className={cn(
      'border rounded-lg p-3',
      task.status === 'pending' && 'bg-yellow-50 border-yellow-200'
    )}>
      {/* Header row: Icon + Type + Priority + Status */}
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium capitalize">{task.type.replace('_', ' ')}</span>
        <Badge variant={priorityVariants[task.priority]} className="capitalize">
          {task.priority}
        </Badge>
        <Badge variant={taskStatusVariants[task.status]} className="capitalize">
          {task.status.replace('_', ' ')}
        </Badge>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-700 mb-2">{task.description}</p>

      {/* Meta row: Room + Department + Time */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-3">
        {task.roomNumber && (
          <Badge className="bg-gray-100 text-gray-600">Room {task.roomNumber}</Badge>
        )}
        <span className="capitalize">{task.department.replace('_', ' ')}</span>
        <span>·</span>
        <span>{formatDateTime(task.createdAt)}</span>
      </div>

      {/* Assigned */}
      {task.assignedName && (
        <p className="text-xs text-gray-500 mb-3">
          Assigned to: <span className="font-medium text-gray-700">{task.assignedName}</span>
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {task.status === 'pending' && (
          <Button
            size="xs"
            onClick={onClaim}
            loading={isClaimPending}
          >
            Claim
          </Button>
        )}
        {task.status === 'in_progress' && (
          <Button
            size="xs"
            onClick={onComplete}
            loading={isCompletePending}
            className="bg-green-600 hover:bg-green-700"
          >
            Complete
          </Button>
        )}
        {(task.status === 'completed' || task.status === 'cancelled') && (
          <span className="text-xs text-gray-400 italic">No actions available</span>
        )}
      </div>
    </div>
  );
}

