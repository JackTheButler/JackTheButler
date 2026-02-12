/**
 * Roles Page
 *
 * Role management page with list and CRUD operations.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, MoreHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';
import { EmptyState } from '@/components';
import { Alert } from '@/components/ui/alert';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RoleFormModal } from '@/components/roles/RoleFormModal';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

/**
 * Role from API
 */
interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  userCount: number;
  createdAt: string;
}

/**
 * Roles content component - can be used standalone or within Settings
 */
export function RolesContent() {
  const { t } = useTranslation('roles');
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can(PERMISSIONS.ADMIN_MANAGE);

  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch roles list
  const { data, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<{ roles: Role[] }>('/roles'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => api.delete(`/roles/${roleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setShowDeleteConfirm(false);
      setRoleToDelete(null);
    },
    onError: (err: Error) => {
      setShowDeleteConfirm(false);
      setDeleteError(err.message || t('errors.deleteFailed'));
    },
  });

  const roles = data?.roles || [];

  const handleEditRole = (role: Role) => {
    setSelectedRole(role);
  };

  const handleDeleteRole = (role: Role) => {
    setRoleToDelete(role);
    setShowDeleteConfirm(true);
  };

  const handleCloseModal = () => {
    setSelectedRole(null);
    setShowAddModal(false);
  };

  const columns: Column<Role>[] = [
    {
      key: 'name',
      header: t('table.name'),
      render: (role) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{role.name}</span>
          {role.isSystem && (
            <Badge variant="secondary" className="text-xs">
              {t('system')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'description',
      header: t('table.description'),
      className: 'min-w-[280px]',
      render: (role) => (
        <span className="text-sm text-muted-foreground">
          {role.description || '-'}
        </span>
      ),
    },
    {
      key: 'permissions',
      header: t('table.permissions'),
      className: 'min-w-[160px]',
      render: (role) => (
        <span className="text-sm text-muted-foreground">
          {role.permissions.includes('*')
            ? t('allPermissions')
            : t('permissionCount', { count: role.permissions.length })}
        </span>
      ),
    },
    {
      key: 'userCount',
      header: t('table.users'),
      render: (role) => (
        <span className="text-sm text-muted-foreground">
          {role.userCount}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-16',
            render: (role: Role) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleEditRole(role)}>
                    {t('actions.edit')}
                  </DropdownMenuItem>
                  {!role.isSystem && (
                    <DropdownMenuItem
                      onClick={() => handleDeleteRole(role)}
                      disabled={role.userCount > 0}
                    >
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
            <Plus className="w-4 h-4 mr-2" />
            {t('addRole')}
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
        data={roles}
        columns={columns}
        keyExtractor={(role) => role.id}
        loading={isLoading}
        emptyState={
          <EmptyState
            icon={Shield}
            title={t('empty.title')}
            description={t('empty.description')}
          />
        }
      />

      {/* Add/Edit Role Modal */}
      <RoleFormModal
        open={showAddModal || !!selectedRole}
        onClose={handleCloseModal}
        role={selectedRole}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('confirm.deleteTitle')}
        description={t('confirm.deleteDescription', { name: roleToDelete?.name })}
        confirmLabel={t('confirm.deleteButton')}
        variant="destructive"
        onConfirm={() => roleToDelete && deleteMutation.mutate(roleToDelete.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
