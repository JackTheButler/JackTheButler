/**
 * Role Form Modal
 *
 * Modal for creating and editing roles with permission picker.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DialogRoot, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { InlineAlert } from '@/components/ui/inline-alert';
import { cn } from '@/lib/utils';

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  userCount: number;
}

interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
  group: string;
}

interface PermissionGroup {
  key: string;
  label: string;
  permissions: PermissionDefinition[];
}

interface PermissionsResponse {
  permissions: PermissionDefinition[];
  groups: PermissionGroup[];
  all: string[];
  wildcard: string;
}

interface RoleFormModalProps {
  open: boolean;
  onClose: () => void;
  role: Role | null;
}

interface FormData {
  name: string;
  description: string;
  permissions: string[];
}

export function RoleFormModal({ open, onClose, role }: RoleFormModalProps) {
  const { t } = useTranslation('roles');
  const queryClient = useQueryClient();
  const isEditing = !!role;

  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    permissions: [],
  });
  const [error, setError] = useState<string | null>(null);

  // Fetch available permissions
  const { data: permissionsData } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<PermissionsResponse>('/permissions'),
    enabled: open,
  });

  const groups = permissionsData?.groups || [];
  const wildcardPermission = permissionsData?.wildcard || '*';

  // Check if role has wildcard (all permissions)
  const hasWildcard = formData.permissions.includes(wildcardPermission);

  // Reset form when modal opens/closes or role changes
  useEffect(() => {
    if (open) {
      if (role) {
        setFormData({
          name: role.name,
          description: role.description || '',
          permissions: role.permissions,
        });
      } else {
        setFormData({
          name: '',
          description: '',
          permissions: [],
        });
      }
      setError(null);
    }
  }, [open, role]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; permissions: string[] }) =>
      api.post('/roles', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message || t('errors.createFailed'));
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string | null; permissions?: string[] }) =>
      api.patch(`/roles/${role?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message || t('errors.updateFailed'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.name.trim()) {
      setError(t('validation.nameRequired'));
      return;
    }
    if (formData.permissions.length === 0) {
      setError(t('validation.permissionsRequired'));
      return;
    }

    if (isEditing) {
      updateMutation.mutate({
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        permissions: formData.permissions,
      });
    } else {
      createMutation.mutate({
        name: formData.name.trim(),
        ...(formData.description.trim() && { description: formData.description.trim() }),
        permissions: formData.permissions,
      });
    }
  };

  const togglePermission = (permissionKey: string) => {
    setFormData((prev) => {
      const has = prev.permissions.includes(permissionKey);
      return {
        ...prev,
        permissions: has
          ? prev.permissions.filter((p) => p !== permissionKey)
          : [...prev.permissions, permissionKey],
      };
    });
  };

  const toggleGroup = (group: PermissionGroup) => {
    const groupKeys = group.permissions.map((p) => p.key);
    const allSelected = groupKeys.every((key) => formData.permissions.includes(key));

    setFormData((prev) => {
      if (allSelected) {
        // Remove all group permissions
        return {
          ...prev,
          permissions: prev.permissions.filter((p) => !groupKeys.includes(p)),
        };
      } else {
        // Add all group permissions
        const newPermissions = new Set([...prev.permissions, ...groupKeys]);
        return {
          ...prev,
          permissions: Array.from(newPermissions),
        };
      }
    });
  };

  const isGroupFullySelected = (group: PermissionGroup) => {
    return group.permissions.every((p) => formData.permissions.includes(p.key));
  };

  const isGroupPartiallySelected = (group: PermissionGroup) => {
    const selected = group.permissions.filter((p) => formData.permissions.includes(p.key));
    return selected.length > 0 && selected.length < group.permissions.length;
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <DialogRoot open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={isEditing ? t('editRole') : t('addRole')} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-4 space-y-6 flex-1 min-h-0 overflow-y-auto">
            {error && <InlineAlert variant="error">{error}</InlineAlert>}

            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('labels.name')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('placeholders.name')}
                  disabled={isEditing && role?.isSystem}
                  autoFocus
                />
                {isEditing && role?.isSystem && (
                  <p className="text-xs text-muted-foreground">
                    {t('helpText.systemRoleLocked')}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('labels.description')}</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('placeholders.description')}
                />
              </div>
            </div>

            {/* Permissions */}
            <div className="space-y-4">
              <div>
                <Label>{t('labels.permissions')}</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('helpText.permissionsInfo')}
                </p>
              </div>

              {hasWildcard ? (
                <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground">
                  {t('helpText.allPermissions')}
                </div>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <div key={group.key} className="border rounded-lg overflow-hidden">
                      {/* Group Header */}
                      <div
                        className="flex items-center gap-3 p-3 bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => toggleGroup(group)}
                      >
                        <Checkbox
                          checked={isGroupFullySelected(group)}
                          indeterminate={isGroupPartiallySelected(group)}
                          onCheckedChange={() => toggleGroup(group)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="font-medium text-sm">{group.label}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {group.permissions.filter((p) => formData.permissions.includes(p.key)).length}
                          /{group.permissions.length}
                        </span>
                      </div>

                      {/* Group Permissions */}
                      <div className="p-3 space-y-2">
                        {group.permissions.map((permission) => (
                          <div
                            key={permission.key}
                            className={cn(
                              'flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors',
                              formData.permissions.includes(permission.key)
                                ? 'bg-primary/5'
                                : 'hover:bg-muted/50'
                            )}
                            onClick={() => togglePermission(permission.key)}
                          >
                            <Checkbox
                              checked={formData.permissions.includes(permission.key)}
                              onCheckedChange={() => togglePermission(permission.key)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{permission.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {permission.description}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Selected count */}
              {!hasWildcard && (
                <div className="text-sm text-muted-foreground">
                  {t('permissionSelected', { count: formData.permissions.length })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-4 py-3 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t('buttons.cancel')}
            </Button>
            <Button type="submit" loading={isPending}>
              {isEditing ? t('buttons.saveChanges') : t('buttons.createRole')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
