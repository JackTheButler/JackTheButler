import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronDown, Languages, SquareArrowOutUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/formatters';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChannelIcon } from '@/components/shared/ChannelIcon';

interface Props {
  id: string;
  onBack?: () => void;
}

interface ConversationDetails {
  id: string;
  channelType: string;
  channelId: string;
  state: string;
  guestId: string | null;
  guestName?: string;
  guestLanguage?: string | null;
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
  translatedContent?: string | null;
  detectedLanguage?: string | null;
  intent: string | null;
  createdAt: string;
}

export function ConversationView({ id, onBack }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManageConversations = can(PERMISSIONS.CONVERSATIONS_MANAGE);
  const [input, setInput] = useState('');
  const [stateMenuOpen, setStateMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stateMenuRef = useRef<HTMLDivElement>(null);

  const { data: convData } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.get<{ conversation: ConversationDetails }>(`/conversations/${id}`),
  });

  const { data: msgData, isLoading: loadingMessages } = useQuery({
    queryKey: ['messages', id],
    queryFn: () => api.get<{ messages: Message[] }>(`/conversations/${id}/messages`),
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
      <div className="h-full flex items-center justify-center text-muted-foreground">
        {t('conversations.loading')}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="p-2 sm:p-4 border-b shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="md:hidden p-1 -ml-1 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <ChannelIcon channel={conv.channelType} size="lg" boxed inverted />
            <div>
              <h2 className="font-medium text-foreground">
                {conv.guestId ? (
                  <Link
                    to={`/guests/${conv.guestId}`}
                    state={{ fromLabel: t('conversations.backToChat') }}
                    className="inline-flex items-center gap-1 group hover:text-foreground/80 transition-colors"
                  >
                    {conv.guestName || formatChannelId(conv.channelType, conv.channelId)}
                    <SquareArrowOutUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ) : (
                  conv.guestName || formatChannelId(conv.channelType, conv.channelId)
                )}
              </h2>
              {(conv.guestLanguage || conv.currentIntent) && (
                <div className="flex items-center gap-2">
                  {conv.guestLanguage && conv.guestLanguage !== 'en' && (
                    <Badge variant="outline" className="text-xs uppercase px-1.5">
                      {conv.guestLanguage}
                    </Badge>
                  )}
                  {conv.currentIntent && (
                    <span className="text-sm text-muted-foreground">{conv.currentIntent}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="relative" ref={stateMenuRef}>
            {canManageConversations ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStateMenuOpen(!stateMenuOpen)}
              >
                <span className="capitalize">{t(`conversations.states.${conv.state}`)}</span>
                <ChevronDown size={14} className={cn('transition-transform', stateMenuOpen && 'rotate-180')} />
              </Button>
            ) : (
              <Badge variant="outline" className="capitalize">
                {t(`conversations.states.${conv.state}`)}
              </Badge>
            )}

            {stateMenuOpen && canManageConversations && (
              <div className="absolute end-0 mt-1 w-40 bg-card border border-border rounded-md shadow-lg py-1 z-50">
                {(conv.state === 'active' || conv.state === 'new') && (
                  <button
                    onClick={() => updateStateMutation.mutate('escalated')}
                    disabled={updateStateMutation.isPending}
                    className="w-full px-3 py-2 text-start text-sm text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {t('conversations.escalate')}
                  </button>
                )}
                {conv.state === 'escalated' && (
                  <button
                    onClick={() => updateStateMutation.mutate('active')}
                    disabled={updateStateMutation.isPending}
                    className="w-full px-3 py-2 text-start text-sm text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {t('conversations.deEscalate')}
                  </button>
                )}
                {conv.state !== 'resolved' && conv.state !== 'closed' && (
                  <button
                    onClick={() => updateStateMutation.mutate('resolved')}
                    disabled={updateStateMutation.isPending}
                    className="w-full px-3 py-2 text-start text-sm text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {t('conversations.resolve')}
                  </button>
                )}
                {(conv.state === 'resolved' || conv.state === 'closed') && (
                  <button
                    onClick={() => updateStateMutation.mutate('active')}
                    disabled={updateStateMutation.isPending}
                    className="w-full px-3 py-2 text-start text-sm text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {t('conversations.reopen')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-2 sm:p-4 space-y-3">
        {loadingMessages ? (
          <div className="text-center text-muted-foreground">{t('conversations.loadingMessages')}</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground">{t('conversations.noMessages')}</div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} t={t} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {canManageConversations && (
        <div className="p-4 border-t shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('conversations.typeMessage')}
              className="flex-1 px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={sendMutation.isPending}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
            >
              {t('conversations.send')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, t }: { message: Message; t: (key: string) => string }) {
  const isInbound = message.direction === 'inbound';
  const [showAlt, setShowAlt] = useState(false);
  const hasTranslation = !!message.translatedContent;

  // Inbound: secondary is original (guest language)
  // Outbound: secondary is translatedContent (what guest received)
  const altContent = isInbound ? message.content : message.translatedContent;

  const toggleLabel = isInbound
    ? (showAlt ? t('conversations.showTranslation') : t('conversations.showOriginal'))
    : (showAlt ? t('conversations.showStaffVersion') : t('conversations.showGuestVersion'));

  const senderLabel = t(`conversations.senderTypes.${message.senderType}`);

  // Primary content: inbound shows translation (staff language), outbound shows original (staff language)
  const primaryContent = isInbound
    ? (message.translatedContent ?? message.content)
    : message.content;

  return (
    <div className={cn('flex', isInbound ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[70%] rounded-lg px-3 py-2',
          isInbound ? 'bg-muted' : 'bg-blue-600 dark:bg-blue-900 text-white',
          message.senderType === 'ai' && !isInbound && 'bg-green-600 dark:bg-green-900'
        )}
      >
        <div
          className={cn(
            'text-xs mb-1',
            isInbound ? 'text-muted-foreground' : 'text-white/70'
          )}
        >
          {senderLabel}
        </div>
        <div className="text-sm whitespace-pre-wrap">{primaryContent}</div>
        {hasTranslation && (
          <div className={cn(
            'grid transition-[grid-template-rows] duration-150 ease-in-out',
            showAlt ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          )}>
            <div className="overflow-hidden">
              <div className={cn(
                'text-sm whitespace-pre-wrap mt-2 pt-2 border-t italic',
                isInbound ? 'border-muted-foreground/20' : 'border-white/20'
              )}>
                {altContent}
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between mt-1">
          <span
            className={cn(
              'text-xs',
              isInbound ? 'text-muted-foreground/70' : 'text-white/60'
            )}
          >
            {formatTime(message.createdAt)}
          </span>
          {hasTranslation && (
            <button
              onClick={() => setShowAlt(!showAlt)}
              className={cn(
                'flex items-center gap-1 text-xs',
                isInbound ? 'text-muted-foreground hover:text-foreground' : 'text-white/60 hover:text-white/80'
              )}
            >
              <Languages className="w-3 h-3" />
              {toggleLabel}
              <ChevronDown className={cn('w-3 h-3 transition-transform', showAlt && 'rotate-180')} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatChannelId(channel: string, id: string): string {
  if (channel === 'whatsapp' || channel === 'sms') {
    if (id.length > 6) {
      const prefix = id.startsWith('+') ? '' : '+';
      return `${prefix}${id.slice(0, -4)}****`;
    }
  }
  if (channel === 'telegram') return `Telegram ${id}`;
  if (channel === 'webchat') return 'Web Visitor';
  if (channel === 'email') return id;
  return 'Guest';
}
