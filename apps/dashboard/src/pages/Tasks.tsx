import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
type TaskSource = 'manual' | 'auto' | 'automation';

interface Task {
  id: string;
  conversationId: string | null;
  source: TaskSource;
  type: string;
  department: string;
  roomNumber: string | null;
  description: string;
  priority: string;
  status: TaskStatus;
  assignedTo: string | null;
  assignedName?: string;
  dueAt: string | null;
  createdAt: string;
}

const statusFilters: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

const sourceFilters: { value: TaskSource | 'all'; label: string }[] = [
  { value: 'all', label: 'All Sources' },
  { value: 'auto', label: 'Auto' },
  { value: 'manual', label: 'Manual' },
];

const sourceColors: Record<string, string> = {
  auto: 'bg-indigo-100 text-indigo-700',
  manual: 'bg-gray-100 text-gray-600',
  automation: 'bg-teal-100 text-teal-700',
};

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  standard: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

export function TasksPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<TaskSource | 'all'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', statusFilter, sourceFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      const queryString = params.toString();
      return api.get<{ tasks: Task[] }>(`/tasks${queryString ? `?${queryString}` : ''}`);
    },
    refetchInterval: 10000,
  });

  const claimMutation = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/claim`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/complete`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const tasks = data?.tasks || [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
        <div className="flex gap-4">
          <div className="flex gap-1">
            {sourceFilters.map((s) => (
              <button
                key={s.value}
                onClick={() => setSourceFilter(s.value)}
                className={cn(
                  'px-3 py-1 text-sm rounded',
                  sourceFilter === s.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {statusFilters.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={cn(
                  'px-3 py-1 text-sm rounded',
                  statusFilter === s.value
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-500">Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="text-gray-500">No tasks found</div>
      ) : (
        <div className="bg-white rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">Type</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">Description</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">Room</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">Source</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">Priority</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">Status</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">Assigned</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-3">
                    <span className="text-sm font-medium capitalize">{task.type.replace('_', ' ')}</span>
                    <div className="text-xs text-gray-500">{task.department}</div>
                  </td>
                  <td className="p-3 text-sm text-gray-900 max-w-xs truncate">
                    {task.description}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {task.roomNumber || '-'}
                  </td>
                  <td className="p-3">
                    <span className={cn('text-xs px-2 py-1 rounded', sourceColors[task.source])}>
                      {task.source === 'auto' ? '⚡ Auto' : task.source === 'automation' ? '🤖 Rule' : 'Manual'}
                    </span>
                    {task.conversationId && (
                      <a
                        href={`/conversations/${task.conversationId}`}
                        className="ml-2 text-xs text-blue-600 hover:underline"
                        title="View conversation"
                      >
                        💬
                      </a>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={cn('text-xs px-2 py-1 rounded', priorityColors[task.priority])}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={cn('text-xs px-2 py-1 rounded', statusColors[task.status])}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {task.assignedName || '-'}
                  </td>
                  <td className="p-3">
                    {task.status === 'pending' && (
                      <button
                        onClick={() => claimMutation.mutate(task.id)}
                        disabled={claimMutation.isPending}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Claim
                      </button>
                    )}
                    {task.status === 'in_progress' && (
                      <button
                        onClick={() => completeMutation.mutate(task.id)}
                        disabled={completeMutation.isPending}
                        className="text-sm text-green-600 hover:text-green-800"
                      >
                        Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
