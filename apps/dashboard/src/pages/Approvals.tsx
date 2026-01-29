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
  Filter,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

const typeLabels: Record<ApprovalItemType, { label: string; icon: typeof MessageSquare }> = {
  response: { label: 'Response', icon: MessageSquare },
  task: { label: 'Task', icon: ListTodo },
  offer: { label: 'Offer', icon: Gift },
};

const statusColors: Record<ApprovalStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
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

function ApprovalCard({
  item,
  onApprove,
  onReject,
}: {
  item: ApprovalItem;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showConversation, setShowConversation] = useState(false);

  const typeInfo = typeLabels[item.type];
  const Icon = typeInfo?.icon || MessageSquare;

  // Parse action data
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
  let actionData: ActionData = {};
  try {
    actionData = JSON.parse(item.actionData) as ActionData;
  } catch {
    // Invalid JSON, use empty object
  }

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await onApprove();
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setIsRejecting(true);
    try {
      await onReject(rejectReason);
      setShowRejectForm(false);
      setRejectReason('');
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white shadow-sm">
              <Icon className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold">{typeInfo?.label || item.type}</span>
                <Badge className={statusColors[item.status]}>{item.status}</Badge>
              </div>
              {/* Info capsules */}
              <div className="flex flex-wrap items-center gap-1.5">
                {item.guestName && (
                  <Badge variant="outline" className="text-xs font-normal bg-white">
                    {item.guestName}
                  </Badge>
                )}
                {(item.roomNumber || actionData.roomNumber) && (
                  <Badge variant="outline" className="text-xs font-normal bg-white">
                    Room {item.roomNumber || String(actionData.roomNumber)}
                  </Badge>
                )}
                {item.conversationChannel && (
                  <Badge variant="outline" className="text-xs font-normal bg-white capitalize">
                    {item.conversationChannel}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            {formatTimeAgo(item.createdAt)}
          </div>
        </div>

        {/* Conversation Context (Collapsible) */}
        {item.conversationMessages && item.conversationMessages.length > 0 && (
          <div className="border-b">
            <button
              type="button"
              onClick={() => setShowConversation(!showConversation)}
              className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-50 transition-colors"
            >
              {showConversation ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
              <span className="text-xs text-gray-500 uppercase font-medium">
                Conversation Context
              </span>
              <Badge variant="outline" className="text-xs ml-1">
                {item.conversationMessages.length}
              </Badge>
            </button>
            {showConversation && (
              <div className="px-4 pb-4 space-y-2 max-h-48 overflow-y-auto">
                {item.conversationMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'p-2 rounded-lg text-sm',
                      msg.direction === 'inbound'
                        ? 'bg-gray-100 mr-8'
                        : 'bg-blue-50 ml-8'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-xs text-gray-500">
                        {msg.direction === 'inbound' ? 'Guest' : msg.senderType === 'ai' ? 'Jack' : 'Staff'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatTimeAgo(msg.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content Preview */}
        <div className="p-4">
          {item.type === 'response' && actionData.content && (
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 uppercase">Proposed Response</Label>
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-sm whitespace-pre-wrap">{String(actionData.content)}</p>
              </div>
              {actionData.intent && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Intent:</span>
                  <Badge variant="outline">{String(actionData.intent)}</Badge>
                  {actionData.confidence && (
                    <span className="text-gray-400">
                      ({((actionData.confidence as number) * 100).toFixed(0)}% confident)
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {item.type === 'task' && (
            <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="capitalize">
                  {String(actionData.type || 'task').replace('_', ' ')}
                </Badge>
                <Badge variant="outline">{String(actionData.department)}</Badge>
                <Badge
                  className={cn(
                    actionData.priority === 'urgent'
                      ? 'bg-red-100 text-red-700'
                      : actionData.priority === 'high'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-blue-100 text-blue-700'
                  )}
                >
                  {String(actionData.priority)}
                </Badge>
              </div>
              <p className="text-sm">{String(actionData.description)}</p>
            </div>
          )}

          {item.type === 'offer' && (
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 uppercase">Proposed Offer</Label>
              <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                <p className="text-sm">{JSON.stringify(actionData, null, 2)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {item.status === 'pending' && (
          <div className="p-4 border-t bg-gray-50">
            {showRejectForm ? (
              <div className="space-y-3">
                <Input
                  placeholder="Enter rejection reason..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleReject}
                    disabled={!rejectReason.trim() || isRejecting}
                  >
                    {isRejecting ? 'Rejecting...' : 'Confirm Reject'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowRejectForm(false);
                      setRejectReason('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button onClick={handleApprove} disabled={isApproving} className="flex-1">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {isApproving ? 'Approving...' : 'Approve'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRejectForm(true)}
                  className="flex-1"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Decided info */}
        {item.status !== 'pending' && (
          <div className="p-4 border-t bg-gray-50">
            <div className="flex items-center gap-2 text-sm">
              {item.status === 'approved' ? (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600" />
              )}
              <span className="capitalize">{item.status}</span>
              {item.staffName && <span className="text-gray-500">by {item.staffName}</span>}
              {item.decidedAt && (
                <span className="text-gray-400">{formatTimeAgo(item.decidedAt)}</span>
              )}
            </div>
            {item.rejectionReason && (
              <p className="text-sm text-red-600 mt-2">Reason: {item.rejectionReason}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('font-medium text-gray-700', className)}>{children}</div>;
}

function StatsCard({
  label,
  value,
  icon: Icon,
  variant,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  variant: 'warning' | 'success' | 'error';
}) {
  const colors = {
    warning: 'text-yellow-600 bg-yellow-50',
    success: 'text-green-600 bg-green-50',
    error: 'text-red-600 bg-red-50',
  };

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-card border">
      <div className={cn('p-2 rounded-lg', colors[variant])}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<ApprovalStatus | 'all'>('pending');
  const [filterType, setFilterType] = useState<ApprovalItemType | 'all'>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['approvals', filterStatus, filterType],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterType !== 'all') params.set('type', filterType);
      const queryString = params.toString();
      return api.get<{ items: ApprovalItem[]; stats: ApprovalStats }>(
        `/approvals${queryString ? `?${queryString}` : ''}`
      );
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/approvals/${id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/approvals/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });

  const items = data?.items || [];
  const stats = data?.stats || { pending: 0, approvedToday: 0, rejectedToday: 0 };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
          {stats.pending > 0 && (
            <Badge className="bg-yellow-100 text-yellow-700">{stats.pending} pending</Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          Review and approve AI-generated responses and actions
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatsCard label="Pending" value={stats.pending} icon={Clock} variant="warning" />
        <StatsCard
          label="Approved Today"
          value={stats.approvedToday}
          icon={CheckCircle2}
          variant="success"
        />
        <StatsCard
          label="Rejected Today"
          value={stats.rejectedToday}
          icon={XCircle}
          variant="error"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex gap-2">
          <Button
            variant={filterStatus === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('pending')}
          >
            <Clock className="w-4 h-4 mr-1" />
            Pending
          </Button>
          <Button
            variant={filterStatus === 'approved' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('approved')}
          >
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Approved
          </Button>
          <Button
            variant={filterStatus === 'rejected' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('rejected')}
          >
            <XCircle className="w-4 h-4 mr-1" />
            Rejected
          </Button>
          <Button
            variant={filterStatus === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('all')}
          >
            All
          </Button>
        </div>
        <div className="flex gap-2">
          <Filter className="w-4 h-4 text-gray-400 self-center" />
          <Button
            variant={filterType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('all')}
          >
            All Types
          </Button>
          <Button
            variant={filterType === 'response' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('response')}
          >
            <MessageSquare className="w-4 h-4 mr-1" />
            Responses
          </Button>
          <Button
            variant={filterType === 'task' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('task')}
          >
            <ListTodo className="w-4 h-4 mr-1" />
            Tasks
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-lg font-medium">Failed to load approvals</p>
          <p className="text-muted-foreground">Please try again later</p>
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-medium">
            {filterStatus === 'pending' ? 'No pending approvals' : 'No items found'}
          </p>
          <p className="text-muted-foreground">
            {filterStatus === 'pending'
              ? 'All caught up! Check back later.'
              : 'Try changing your filters.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              onApprove={() => approveMutation.mutate(item.id)}
              onReject={(reason) => rejectMutation.mutate({ id: item.id, reason })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
