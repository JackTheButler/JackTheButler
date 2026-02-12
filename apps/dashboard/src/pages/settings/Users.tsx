/**
 * Users Page
 *
 * Staff management page with list, filters, and CRUD operations.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, MoreHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/formatters';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';
import { EmptyState } from '@/components';
import { DataTable, Column } from '@/components/DataTable';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { UserFormModal } from '@/components/users/UserFormModal';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

/**
 * Staff member from API
 */
interface StaffMember {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  status: 'active' | 'inactive';
  lastActiveAt: string | null;
  createdAt: string;
  isDeletable?: boolean;
}

/**
 * Role option for selector
 */
interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
}

type StatusFilter = 'all' | 'active' | 'inactive';

/**
 * Users content component - can be used standalone or within Settings
 */
export function UsersContent() {
  const { t } = useTranslation('users');
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can(PERMISSIONS.ADMIN_MANAGE);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<StaffMember | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToToggle, setUserToToggle] = useState<StaffMember | null>(null);
  const [userToDelete, setUserToDelete] = useState<StaffMember | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const statusFilters = [
    { value: 'all' as const, label: t('filters.all') },
    { value: 'active' as const, label: t('filters.active') },
    { value: 'inactive' as const, label: t('filters.inactive') },
  ];

  // Fetch staff list
  const { data, isLoading } = useQuery({
    queryKey: ['staff', statusFilter, searchQuery],
    queryFn: () =>
      api.get<{ staff: StaffMember[]; total: number }>('/staff', {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: searchQuery || undefined,
      }),
  });

  // Fetch roles for dropdown
  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<{ roles: Role[] }>('/roles'),
  });

  // Deactivate mutation
  const deactivateMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/staff/${userId}/deactivate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setShowDeactivateConfirm(false);
      setUserToToggle(null);
    },
  });

  // Activate mutation
  const activateMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/staff/${userId}/activate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/staff/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setShowDeleteConfirm(false);
      setUserToDelete(null);
    },
    onError: (err: Error) => {
      setShowDeleteConfirm(false);
      setDeleteError(err.message || t('errors.deleteFailed'));
    },
  });

  const staff = data?.staff || [];
  const roles = rolesData?.roles || [];

  const handleSearch = () => {
    setSearchQuery(search);
  };

  const handleClearSearch = () => {
    setSearch('');
    setSearchQuery('');
  };

  const handleToggleStatus = (user: StaffMember) => {
    if (user.status === 'active') {
      setUserToToggle(user);
      setShowDeactivateConfirm(true);
    } else {
      activateMutation.mutate(user.id);
    }
  };

  const handleEditUser = (user: StaffMember) => {
    setSelectedUser(user);
  };

  const handleDeleteUser = (user: StaffMember) => {
    setUserToDelete(user);
    setShowDeleteConfirm(true);
  };

  const handleCloseModal = () => {
    setSelectedUser(null);
    setShowAddModal(false);
  };

  const columns: Column<StaffMember>[] = [
    {
      key: 'name',
      header: t('table.name'),
      render: (user) => (
        <div>
          <div className="font-medium text-foreground">{user.name}</div>
          <div className="text-sm text-muted-foreground">{user.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('table.role'),
      render: (user) => (
        <Badge variant="secondary" className="font-normal">
          {user.roleName}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: t('table.status'),
      render: (user) => (
        <Badge variant={user.status === 'active' ? 'success' : 'secondary'}>
          {t(`status.${user.status}`)}
        </Badge>
      ),
    },
    {
      key: 'lastActive',
      header: t('table.lastActive'),
      className: 'min-w-[140px]',
      render: (user) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {user.lastActiveAt ? formatDateTime(user.lastActiveAt) : t('never')}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-16',
            render: (user: StaffMember) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleEditUser(user)}>
                    {t('actions.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                    {user.status === 'active' ? t('actions.deactivate') : t('actions.activate')}
                  </DropdownMenuItem>
                  {user.isDeletable && (
                    <DropdownMenuItem onClick={() => handleDeleteUser(user)}>
                      {t('actions.delete')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowAddModal(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            {t('addUser')}
          </Button>
        )}
      </div>

      {deleteError && (
        <Alert variant="destructive" onDismiss={() => setDeleteError(null)}>
          {deleteError}
        </Alert>
      )}

      {/* Table */}
      <DataTable
        data={staff}
        columns={columns}
        keyExtractor={(user) => user.id}
        loading={isLoading}
        filters={
          <FilterTabs
            options={statusFilters}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        }
        search={{
          value: search,
          onChange: setSearch,
          onSearch: handleSearch,
          onClear: handleClearSearch,
          placeholder: t('searchPlaceholder'),
        }}
        emptyState={
          <EmptyState
            icon={Users}
            title={t('empty.title')}
            description={
              searchQuery
                ? t('empty.descriptionFiltered')
                : t('empty.description')
            }
          />
        }
      />

      {/* Add/Edit User Modal */}
      <UserFormModal
        open={showAddModal || !!selectedUser}
        onClose={handleCloseModal}
        user={selectedUser}
        roles={roles}
      />

      {/* Deactivate Confirmation */}
      <ConfirmDialog
        open={showDeactivateConfirm}
        onOpenChange={setShowDeactivateConfirm}
        title={t('confirm.deactivateTitle')}
        description={t('confirm.deactivateDescription', { name: userToToggle?.name })}
        confirmLabel={t('confirm.deactivateButton')}
        variant="destructive"
        onConfirm={() => userToToggle && deactivateMutation.mutate(userToToggle.id)}
        loading={deactivateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('confirm.deleteTitle')}
        description={t('confirm.deleteDescription', { name: userToDelete?.name })}
        confirmLabel={t('confirm.deleteButton')}
        variant="destructive"
        onConfirm={() => userToDelete && deleteMutation.mutate(userToDelete.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
