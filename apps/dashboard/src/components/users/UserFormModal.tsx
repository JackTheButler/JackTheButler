/**
 * User Form Modal
 *
 * Modal for creating and editing staff members.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DialogRoot, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { InlineAlert } from '@/components/ui/inline-alert';

interface StaffMember {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  status: 'active' | 'inactive';
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  user: StaffMember | null;
  roles: Role[];
}

interface FormData {
  name: string;
  email: string;
  password: string;
  roleId: string;
}

export function UserFormModal({ open, onClose, user, roles }: UserFormModalProps) {
  const { t } = useTranslation('users');
  const queryClient = useQueryClient();
  const isEditing = !!user;

  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    password: '',
    roleId: '',
  });
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens/closes or user changes
  useEffect(() => {
    if (open) {
      if (user) {
        setFormData({
          name: user.name,
          email: user.email,
          password: '',
          roleId: user.roleId,
        });
      } else {
        setFormData({
          name: '',
          email: '',
          password: '',
          roleId: roles[0]?.id || '',
        });
      }
      setError(null);
    }
  }, [open, user, roles]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: FormData) =>
      api.post('/staff', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message || t('errors.createFailed'));
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; roleId?: string }) =>
      api.patch(`/staff/${user?.id}`, data),
    onSuccess: () => {
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
    if (!formData.email.trim()) {
      setError(t('validation.emailRequired'));
      return;
    }
    if (!isEditing && !formData.password) {
      setError(t('validation.passwordRequired'));
      return;
    }
    if (!isEditing && formData.password.length < 8) {
      setError(t('validation.passwordMinLength'));
      return;
    }
    if (!formData.roleId) {
      setError(t('validation.roleRequired'));
      return;
    }

    if (isEditing) {
      updateMutation.mutate({
        name: formData.name.trim(),
        roleId: formData.roleId,
      });
    } else {
      createMutation.mutate({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        roleId: formData.roleId,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <DialogRoot open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={isEditing ? t('editUser') : t('addUser')} className="max-w-md">
        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-4">
            {error && <InlineAlert variant="error">{error}</InlineAlert>}

            <div className="space-y-2">
              <Label htmlFor="name">{t('labels.name')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('placeholders.name')}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('labels.email')}</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder={t('placeholders.email')}
                disabled={isEditing}
              />
              {isEditing && (
                <p className="text-xs text-muted-foreground">
                  {t('helpText.emailLocked')}
                </p>
              )}
            </div>

            {!isEditing && (
              <div className="space-y-2">
                <Label htmlFor="password">{t('labels.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={t('placeholders.password')}
                  autoComplete="new-password"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="role">{t('labels.role')}</Label>
              <Select
                value={formData.roleId}
                onValueChange={(value) => setFormData({ ...formData, roleId: value })}
              >
                <SelectTrigger id="role">
                  <SelectValue placeholder={t('placeholders.role')} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>

          <DialogFooter className="px-4 py-3 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t('buttons.cancel')}
            </Button>
            <Button type="submit" loading={isPending}>
              {isEditing ? t('buttons.saveChanges') : t('buttons.createUser')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
