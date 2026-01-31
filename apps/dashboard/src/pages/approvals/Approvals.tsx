import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  ListTodo,
  Gift,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { DialogRoot, DialogContent } from '@/components/ui/dialog';
import { PageContainer, StatsBar, EmptyState, ChannelIcon } from '@/components';

type ApprovalItemType = 'response' | 'task' | 'offer';
type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface ConversationMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  senderType: string;
  content: string;
  createdAt: string;
}

interface ApprovalItem {
  id: string;
  type: ApprovalItemType;
  actionType: string;
  actionData: string;
  conversationId: string | null;
  guestId: string | null;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  rejectionReason: string | null;
  guestName?: string;
  roomNumber?: string;
  conversationChannel?: string;
  staffName?: string;
  conversationMessages?: ConversationMessage[];
}

interface ApprovalStats {
  pending: number;
  approvedToday: number;
  rejectedToday: number;
}

interface ActionData {
  content?: string;
  intent?: string;
  confidence?: number;
  type?: string;
  department?: string;
  priority?: string;
  description?: string;
  roomNumber?: string;
  [key: string]: unknown;
}

const typeConfig: Record<ApprovalItemType, { label: string; icon: typeof MessageSquare }> = {
  response: { label: 'Response', icon: MessageSquare },
  task: { label: 'Task', icon: ListTodo },
  offer: { label: 'Offer', icon: Gift },
};

const statusFilters: { value: ApprovalStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  standard: 'bg-gray-100 text-gray-600',
  low: 'bg-gray-100 text-gray-600',
};

const statusColors: Record<ApprovalStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-gray-100 text-gray-600',
  rejected: 'bg-red-100 text-red-700',
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function parseActionData(actionData: string): ActionData {
  try {
    return JSON.parse(actionData) as ActionData;
  } catch {
    return {};
  }
}

function getPreviewText(item: ApprovalItem, actionData: ActionData): string {
  if (item.type === 'response' && actionData.content) {
    return String(actionData.content);
  }
  if (item.type === 'task' && actionData.description) {
    return String(actionData.description);
  }
  return '';
}

function ExpandedRow({
  item,
  actionData,
  onReject,
  isRejecting,
  showRejectForm,
  setShowRejectForm,
}: {
  item: ApprovalItem;
  actionData: ActionData;
  onReject: (reason: string) => void;
  isRejecting: boolean;
  showRejectForm: boolean;
  setShowRejectForm: (show: boolean) => void;
}) {
  const [rejectReason, setRejectReason] = useState('');
  const [showConversation, setShowConversation] = useState(false);

  const handleReject = () => {
    if (!rejectReason.trim()) return;
    onReject(rejectReason);
    setRejectReason('');
  };

  return (
    <div className="p-4 space-y-3">
      {/* Content Preview */}
      {item.type === 'response' && actionData.content && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 uppercase font-medium">Proposed Response</div>
          <p className="text-sm whitespace-pre-wrap">{String(actionData.content)}</p>
          {(actionData.intent || actionData.confidence) && (
            <div className="flex items-center gap-2">
              {actionData.intent && (
                <Badge className="bg-gray-700 text-white capitalize">{String(actionData.intent)}</Badge>
              )}
              {actionData.confidence && (
                <Badge className="bg-gray-700 text-white">{((actionData.confidence as number) * 100).toFixed(0)}% confident</Badge>
              )}
            </div>
          )}
        </div>
      )}

      {item.type === 'task' && actionData.description && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 uppercase font-medium">Task Details</div>
          <p className="text-sm">{String(actionData.description)}</p>
          <div className="flex items-center gap-2">
            {actionData.department && (
              <Badge className="bg-gray-700 text-white capitalize">{String(actionData.department)}</Badge>
            )}
            {actionData.type && (
              <Badge className="bg-gray-700 text-white capitalize">{String(actionData.type)}</Badge>
            )}
          </div>
        </div>
      )}

      {item.type === 'offer' && (
        <div className="space-y-1">
          <div className="text-xs text-gray-500 uppercase font-medium">Proposed Offer</div>
          <pre className="text-xs overflow-auto">{JSON.stringify(actionData, null, 2)}</pre>
        </div>
      )}

      {/* Conversation Context - opens in dialog */}
      {item.conversationMessages && item.conversationMessages.length > 0 && (
        <>
          <button
            onClick={() => setShowConversation(true)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <MessageSquare className="w-3 h-3" />
            View conversation ({item.conversationMessages.length} messages)
          </button>
          <DialogRoot open={showConversation} onOpenChange={setShowConversation}>
            <DialogContent title="Conversation" className="max-w-xl">
              <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                {item.conversationMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'p-2 rounded text-sm',
                      msg.direction === 'inbound'
                        ? 'bg-gray-100 mr-8'
                        : 'bg-blue-50 ml-8'
                    )}
                  >
                    <span className="text-xs text-gray-500">
                      {msg.direction === 'inbound' ? 'Guest' : msg.senderType === 'ai' ? 'Jack' : 'Staff'}:
                    </span>{' '}
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  </div>
                ))}
              </div>
            </DialogContent>
          </DialogRoot>
        </>
      )}

      {/* Rejection form */}
      {item.status === 'pending' && showRejectForm && (
        <div className="flex items-center gap-2 pt-2 border-t">
          <Input
            placeholder="Rejection reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="flex-1 h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && rejectReason.trim()) handleReject();
              if (e.key === 'Escape') setShowRejectForm(false);
            }}
          />
          <Button
            variant="destructive"
            size="sm"
            onClick={handleReject}
            disabled={!rejectReason.trim() || isRejecting}
          >
            {isRejecting ? 'Rejecting...' : 'Reject'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRejectForm(false)}
          >
            Cancel
          </Button>
        </div>
      )}

    </div>
  );
}

export function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<ApprovalStatus | 'all'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectFormId, setRejectFormId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['approvals', filterStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      const queryString = params.toString();
      return api.get<{ items: ApprovalItem[]; stats: ApprovalStats }>(
        `/approvals${queryString ? `?${queryString}` : ''}`
      );
    },
    refetchInterval: 5000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/approvals/${id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setApprovingId(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/approvals/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setRejectingId(null);
    },
  });

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    approveMutation.mutate(id);
  };

  const handleReject = async (id: string, reason: string) => {
    setRejectingId(id);
    rejectMutation.mutate({ id, reason });
  };

  const items = data?.items || [];
  const stats = data?.stats || { pending: 0, approvedToday: 0, rejectedToday: 0 };

  const filters = (
    <div className="flex gap-1 flex-nowrap">
      {statusFilters.map((s) => (
        <button
          key={s.value}
          onClick={() => setFilterStatus(s.value)}
          className={cn(
            'px-3 py-1 text-sm rounded whitespace-nowrap',
            filterStatus === s.value
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );

  return (
    <PageContainer>
      <StatsBar
        items={[
          { label: 'Pending', value: stats.pending, icon: Clock },
          { label: 'Approved Today', value: stats.approvedToday, icon: CheckCircle2 },
          { label: 'Rejected Today', value: stats.rejectedToday, icon: XCircle },
        ]}
      />

      <Card>
        <div className="px-4 py-2 border-b flex items-center justify-between gap-4">
          <div className="overflow-x-auto flex-1 scrollbar-hide">
            <div className="min-w-fit">
              {filters}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : error ? (
          <EmptyState
            icon={AlertCircle}
            title="Failed to load approvals"
            description="Please try again later"
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={filterStatus === 'pending' ? 'No pending approvals' : 'No items found'}
            description={filterStatus === 'pending' ? 'All caught up!' : 'Try changing your filters.'}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="px-4 w-12"></TableHead>
                <TableHead className="px-4 min-w-[140px]">Guest</TableHead>
                <TableHead className="px-4">Preview</TableHead>
                <TableHead className="px-4 min-w-[90px]">Priority</TableHead>
                <TableHead className="px-4 min-w-[80px]">Time</TableHead>
                <TableHead className="px-4 min-w-[100px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const actionData = parseActionData(item.actionData);
                const typeInfo = typeConfig[item.type];
                const Icon = typeInfo?.icon || MessageSquare;
                const isExpanded = expandedId === item.id;
                const preview = getPreviewText(item, actionData);

                return (
                  <>
                    <TableRow
                      key={item.id}
                      className={cn('cursor-pointer', isExpanded && 'bg-muted/30')}
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <TableCell className="px-4">
                        <Tooltip content={typeInfo?.label}>
                          <Icon className="w-4 h-4 text-gray-500" />
                        </Tooltip>
                      </TableCell>
                      <TableCell className="px-4">
                        <div className="text-sm">
                          <div className="font-medium">{item.guestName || <span className="text-gray-400 italic">Unknown</span>}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.conversationChannel && (
                              <ChannelIcon channel={item.conversationChannel} />
                            )}
                            {(item.roomNumber || actionData.roomNumber) && (
                              <span className="text-xs text-gray-500">
                                Room {item.roomNumber || actionData.roomNumber}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 max-w-xs">
                        <span className="text-sm text-gray-600 truncate block">
                          {preview || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="px-4">
                        {item.type === 'task' && actionData.priority ? (
                          <Badge className={cn('capitalize text-xs', priorityColors[actionData.priority] || 'bg-gray-100 text-gray-600')}>
                            {actionData.priority}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-4">
                        <span className="text-sm text-gray-500">{formatTimeAgo(item.createdAt)}</span>
                      </TableCell>
                      <TableCell className="px-4">
                        {item.status === 'pending' ? (
                          <div onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger>
                                <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem
                                  onClick={() => handleApprove(item.id)}
                                  disabled={approvingId === item.id}
                                >
                                  {approvingId === item.id ? 'Approving...' : 'Approve'}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setExpandedId(item.id);
                                    setRejectFormId(item.id);
                                  }}
                                >
                                  Reject
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ) : (
                          <Tooltip
                            content={
                              (item.staffName || item.decidedAt || item.rejectionReason)
                                ? `${item.staffName ? `By ${item.staffName}` : ''}${item.decidedAt ? ` • ${formatTimeAgo(item.decidedAt)}` : ''}${item.rejectionReason ? ` • ${item.rejectionReason}` : ''}`
                                : null
                            }
                          >
                            <Badge className={cn('capitalize text-xs', statusColors[item.status])}>
                              {item.status}
                            </Badge>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${item.id}-expanded`}>
                        <TableCell colSpan={6} className="p-0 bg-gray-50">
                          <ExpandedRow
                            item={item}
                            actionData={actionData}
                            onReject={(reason) => handleReject(item.id, reason)}
                            isRejecting={rejectingId === item.id}
                            showRejectForm={rejectFormId === item.id}
                            setShowRejectForm={(show) => setRejectFormId(show ? item.id : null)}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </PageContainer>
  );
}
