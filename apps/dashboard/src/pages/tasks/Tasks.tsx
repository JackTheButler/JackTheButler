import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ListTodo, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/formatters';
import {
  taskStatusFilters,
  taskStatusVariants,
  priorityVariants,
} from '@/lib/config';
import type { Task, TaskStatus } from '@/types/api';
import { PageContainer, EmptyState } from '@/components';
import { DataTable, Column } from '@/components/DataTable';
import { DialogRoot, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterTabs } from '@/components/ui/filter-tabs';

export function TasksPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
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

  const reopenMutation = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/reopen`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const tasks = data?.tasks || [];

  const columns: Column<Task>[] = [
    {
      key: 'priority',
      header: '',
      render: (task) => (
        <Badge variant={priorityVariants[task.priority]} className="capitalize">
          {task.priority}
        </Badge>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (task) => (
        <span className="text-sm font-medium capitalize">{task.type.replace('_', ' ')}</span>
      ),
    },
    {
      key: 'roomNumber',
      header: 'Room',
      render: (task) => (
        <span className="text-sm text-muted-foreground">{task.roomNumber || '-'}</span>
      ),
    },
    {
      key: 'description',
      header: 'Task',
      className: 'max-w-md',
      render: (task) => {
        const isLong = task.description.length > 50;
        return (
          <div className="flex items-center gap-2">
            {isLong && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTask(task);
                }}
                className="text-gray-400 hover:text-primary shrink-0"
                title="View details"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
            <span className="text-sm text-foreground truncate">
              {isLong ? `${task.description.slice(0, 50)}...` : task.description}
            </span>
          </div>
        );
      },
    },
    {
      key: 'assignedName',
      header: 'Assigned',
      render: (task) => (
        <span className="text-sm text-muted-foreground">{task.assignedName || '-'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Action',
      render: (task) => (
        <div onClick={(e) => e.stopPropagation()}>
          {task.status === 'pending' && (
            <Button
              size="xs"
              onClick={() => claimMutation.mutate(task.id)}
              disabled={claimMutation.isPending}
            >
              {claimMutation.isPending ? 'Claiming...' : 'Claim'}
            </Button>
          )}
          {task.status === 'in_progress' && (
            <Button
              size="xs"
              onClick={() => completeMutation.mutate(task.id)}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? 'Completing...' : 'Complete'}
            </Button>
          )}
          {(task.status === 'completed' || task.status === 'cancelled') && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => reopenMutation.mutate(task.id)}
              disabled={reopenMutation.isPending}
            >
              {reopenMutation.isPending ? 'Reopening...' : 'Reopen'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <DataTable
        data={tasks}
        columns={columns}
        keyExtractor={(task) => task.id}
        filters={
          <FilterTabs
            options={taskStatusFilters}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        }
        loading={isLoading}
        rowClassName={(task) => task.status === 'pending' ? 'bg-yellow-50' : undefined}
        emptyState={
          <EmptyState
            icon={ListTodo}
            title="No tasks found"
            description="Tasks will appear here when created by guests or staff"
          />
        }
      />

      {/* Task Details Dialog */}
      <DialogRoot open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent title="Task Details" className="max-w-lg">
          {selectedTask && (
            <div className="p-4 space-y-4">
              <p className="text-sm whitespace-pre-wrap">{selectedTask.description}</p>

              <div className="flex flex-wrap gap-2">
                {selectedTask.roomNumber && (
                  <Badge>Room {selectedTask.roomNumber}</Badge>
                )}
                <Badge className="capitalize">{selectedTask.type.replace('_', ' ')}</Badge>
                <Badge variant={priorityVariants[selectedTask.priority]} className="capitalize">
                  {selectedTask.priority}
                </Badge>
                <Badge variant={taskStatusVariants[selectedTask.status]} className="capitalize">
                  {selectedTask.status.replace('_', ' ')}
                </Badge>
              </div>

              {selectedTask.assignedName && (
                <div>
                  <div className="text-xs text-gray-500 uppercase font-medium mb-1">Assigned To</div>
                  <p className="text-sm">{selectedTask.assignedName}</p>
                </div>
              )}

              <div className="text-xs text-gray-400">
                <div>Created {formatDateTime(selectedTask.createdAt)}</div>
                <div className="capitalize">{selectedTask.department.replace('_', ' ')}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </DialogRoot>
    </PageContainer>
  );
}
