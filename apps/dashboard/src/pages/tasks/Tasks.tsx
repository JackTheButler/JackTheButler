import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ListTodo, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/formatters';
import {
  getTaskStatusFilters,
  taskStatusVariants,
  priorityVariants,
} from '@/lib/config';
import { useFilteredQuery } from '@/hooks/useFilteredQuery';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';
import type { Task, TaskStatus } from '@/types/api';
import { PageContainer, EmptyState, DataTable } from '@/components';
import type { Column } from '@/components/DataTable';
import { DialogRoot, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterTabs } from '@/components/ui/filter-tabs';

export function TasksPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManageTasks = can(PERMISSIONS.TASKS_MANAGE);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const { data, isLoading } = useFilteredQuery<{ tasks: Task[] }>({
    queryKey: 'tasks',
    endpoint: '/tasks',
    params: { status: statusFilter },
    refetchInterval: 10000,
  });

  const claimMutation = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/claim`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/complete`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const reopenMutation = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/reopen`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const tasks = data?.tasks || [];
  const taskStatusFilters = getTaskStatusFilters(t);

  const columns: Column<Task>[] = [
    {
      key: 'priority',
      header: '',
      className: 'w-10',
      render: (task) => (
        <Badge variant={priorityVariants[task.priority]} className="capitalize">
          {task.priority}
        </Badge>
      ),
    },
    {
      key: 'type',
      header: t('tasks.type'),
      render: (task) => (
        <span className="text-sm font-medium capitalize">{task.type.replace('_', ' ')}</span>
      ),
    },
    {
      key: 'roomNumber',
      header: t('common.room'),
      className: 'min-w-[96px]',
      render: (task) => (
        <span className="text-sm text-muted-foreground">{task.roomNumber || '-'}</span>
      ),
    },
    {
      key: 'description',
      header: t('tasks.task'),
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
                className="text-muted-foreground hover:text-primary shrink-0"
                title={t('common.viewDetails')}
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
      header: t('tasks.assigned'),
      className: 'min-w-[128px]',
      render: (task) => (
        <span className="text-sm text-muted-foreground">{task.assignedName || '-'}</span>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      className: 'min-w-[140px]',
      render: (task) => (
        <Badge variant={taskStatusVariants[task.status]} className="capitalize">
          {t(`tasks.statuses.${task.status}`)}
        </Badge>
      ),
    },
    {
      key: 'action',
      header: '',
      className: 'min-w-[128px]',
      render: (task) => {
        if (!canManageTasks) return null;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            {task.status === 'pending' && (
              <Button size="xs" onClick={() => claimMutation.mutate(task.id)} loading={claimMutation.isPending}>
                {t('tasks.claim')}
              </Button>
            )}
            {task.status === 'in_progress' && (
              <Button size="xs" onClick={() => completeMutation.mutate(task.id)} loading={completeMutation.isPending}>
                {t('tasks.complete')}
              </Button>
            )}
            {(task.status === 'completed' || task.status === 'cancelled') && (
              <Button variant="outline" size="xs" onClick={() => reopenMutation.mutate(task.id)} loading={reopenMutation.isPending}>
                {t('tasks.reopen')}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <PageContainer>
      <DataTable
        data={tasks}
        columns={columns}
        keyExtractor={(task) => task.id}
        loading={isLoading}
        filters={
          <FilterTabs
            options={taskStatusFilters}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        }
        rowClassName={(task) =>
          task.status === 'pending' ? 'bg-warning hover:bg-warning/80' : undefined
        }
        emptyState={
          <EmptyState
            icon={ListTodo}
            title={t('tasks.noTasks')}
            description={t('tasks.noTasksDescription')}
          />
        }
      />

      <DialogRoot open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent title={t('tasks.details')} className="max-w-lg">
          {selectedTask && (
            <div className="p-4 space-y-4">
              <p className="text-sm whitespace-pre-wrap">{selectedTask.description}</p>

              <div className="flex flex-wrap gap-2">
                {selectedTask.roomNumber && (
                  <Badge>{t('common.room')} {selectedTask.roomNumber}</Badge>
                )}
                <Badge className="capitalize">{selectedTask.type.replace('_', ' ')}</Badge>
                <Badge variant={priorityVariants[selectedTask.priority]} className="capitalize">
                  {selectedTask.priority}
                </Badge>
                <Badge variant={taskStatusVariants[selectedTask.status]}>
                  {t(`tasks.statuses.${selectedTask.status}`)}
                </Badge>
              </div>

              {selectedTask.assignedName && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase font-medium mb-1">{t('tasks.assignedTo')}</div>
                  <p className="text-sm">{selectedTask.assignedName}</p>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                <div>{t('common.created')} {formatDateTime(selectedTask.createdAt)}</div>
                <div className="capitalize">{selectedTask.department.replace('_', ' ')}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </DialogRoot>
    </PageContainer>
  );
}
