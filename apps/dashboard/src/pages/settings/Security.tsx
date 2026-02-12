/**
 * Security Settings Page
 *
 * Configure registration, email verification, admin approval settings,
 * and customize email templates.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { api } from '@/lib/api';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AuthSettings {
  registrationEnabled: boolean;
  emailVerification: 'instant' | 'grace';
  emailVerificationGraceDays: number;
  defaultRoleId: string | null;
  requireAdminApproval: boolean;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

interface EmailTemplate {
  subject: string;
  body: string;
}

interface EmailTemplates {
  passwordReset?: EmailTemplate;
  emailVerification?: EmailTemplate;
  approvalRequest?: EmailTemplate;
  approvalResult?: EmailTemplate;
}

type TemplateKey = keyof EmailTemplates;

const DEFAULT_TEMPLATES: Record<TemplateKey, EmailTemplate> = {
  passwordReset: {
    subject: 'Reset your password',
    body: 'Hi {{name}},\n\nYou requested a password reset. Click the link below to set a new password:\n\n{{link}}\n\nThis link expires in 1 hour. If you did not request this, you can safely ignore this email.\n\nBest regards,\n{{hotelName}}',
  },
  emailVerification: {
    subject: 'Verify your email',
    body: 'Hi {{name}},\n\nPlease verify your email address by clicking the link below:\n\n{{link}}\n\nThis link expires in 7 days.\n\nBest regards,\n{{hotelName}}',
  },
  approvalRequest: {
    subject: 'New account pending approval',
    body: 'Hi,\n\n{{newUserName}} ({{newUserEmail}}) has registered and is waiting for approval.\n\nPlease review their account in the dashboard.\n\nBest regards,\n{{hotelName}}',
  },
  approvalResult: {
    subject: 'Your account has been {{status}}',
    body: 'Hi {{name}},\n\nYour account has been {{status}}.\n\nBest regards,\n{{hotelName}}',
  },
};

const TEMPLATE_VARIABLES: Record<TemplateKey, string[]> = {
  passwordReset: ['name', 'link', 'hotelName'],
  emailVerification: ['name', 'link', 'hotelName'],
  approvalRequest: ['newUserName', 'newUserEmail', 'hotelName'],
  approvalResult: ['name', 'status', 'hotelName'],
};

const TEMPLATE_TABS: TemplateKey[] = ['passwordReset', 'emailVerification', 'approvalRequest', 'approvalResult'];

export function SecurityContent() {
  const { t } = useTranslation('settings');
  const { can } = usePermissions();
  const canManage = can(PERMISSIONS.ADMIN_MANAGE);
  const queryClient = useQueryClient();

  const [form, setForm] = useState<AuthSettings>({
    registrationEnabled: false,
    emailVerification: 'instant',
    emailVerificationGraceDays: 7,
    defaultRoleId: null,
    requireAdminApproval: false,
  });
  const [saved, setSaved] = useState(false);

  // Email templates state
  const [activeTemplate, setActiveTemplate] = useState<TemplateKey>('passwordReset');
  const [templates, setTemplates] = useState<EmailTemplates>({});
  const [templateSaved, setTemplateSaved] = useState(false);

  // Fetch auth settings
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['auth-settings'],
    queryFn: () => api.get<{ settings: AuthSettings }>('/settings/auth'),
  });

  // Fetch roles for dropdown
  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<{ roles: Role[] }>('/roles'),
  });

  // Fetch email templates
  const { data: templatesData } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<{ templates: EmailTemplates }>('/settings/auth/email-templates'),
  });

  // Update form when data loads
  useEffect(() => {
    if (settingsData?.settings) {
      setForm(settingsData.settings);
    }
  }, [settingsData]);

  // Update templates when data loads
  useEffect(() => {
    if (templatesData?.templates) {
      setTemplates(templatesData.templates);
    }
  }, [templatesData]);

  // Save auth settings mutation
  const saveMutation = useMutation({
    mutationFn: (data: Partial<AuthSettings>) =>
      api.put<{ settings: AuthSettings }>('/settings/auth', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  // Save email templates mutation
  const saveTemplatesMutation = useMutation({
    mutationFn: (data: EmailTemplates) =>
      api.put<{ templates: EmailTemplates }>('/settings/auth/email-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 3000);
    },
  });

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  const handleSaveTemplates = () => {
    saveTemplatesMutation.mutate(templates);
  };

  const handleTemplateChange = (key: TemplateKey, field: 'subject' | 'body', value: string) => {
    setTemplates((prev) => ({
      ...prev,
      [key]: {
        ...DEFAULT_TEMPLATES[key],
        ...prev[key],
        [field]: value,
      },
    }));
  };

  const handleResetTemplate = (key: TemplateKey) => {
    setTemplates((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const getTemplateValue = (key: TemplateKey, field: 'subject' | 'body'): string => {
    return templates[key]?.[field] ?? DEFAULT_TEMPLATES[key][field];
  };

  // Non-system roles for the default role dropdown
  const availableRoles = rolesData?.roles || [];

  const templateTabs = TEMPLATE_TABS.map((key) => ({
    id: key,
    label: t(`settings.security.templates.${key}`),
  }));

  const currentVariables = TEMPLATE_VARIABLES[activeTemplate];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">{t('settings.security.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.security.description')}</p>
        </div>
        <div className="space-y-4">
          <div className="h-10 bg-muted animate-pulse rounded" />
          <div className="h-10 bg-muted animate-pulse rounded" />
          <div className="h-10 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{t('settings.security.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.security.description')}</p>
      </div>

      {/* Authentication Settings Card */}
      <Card className="p-6">
        <div className="space-y-6">
          {/* Registration */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">{t('settings.security.registration')}</h3>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('settings.security.openRegistration')}</Label>
                <p className="text-sm text-muted-foreground">{t('settings.security.openRegistrationDesc')}</p>
              </div>
              <Switch
                checked={form.registrationEnabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, registrationEnabled: checked }))}
                disabled={!canManage}
              />
            </div>

            {form.registrationEnabled && (
              <>
                <div className="grid gap-2">
                  <Label>{t('settings.security.defaultRole')}</Label>
                  <Select
                    value={form.defaultRoleId || ''}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, defaultRoleId: value }))}
                    disabled={!canManage}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('settings.security.selectRole')} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t('settings.security.adminApproval')}</Label>
                    <p className="text-sm text-muted-foreground">{t('settings.security.adminApprovalDesc')}</p>
                  </div>
                  <Switch
                    checked={form.requireAdminApproval}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, requireAdminApproval: checked }))}
                    disabled={!canManage}
                  />
                </div>
              </>
            )}
          </div>

          {/* Email Verification */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-medium text-muted-foreground">{t('settings.security.emailVerification')}</h3>

            <div className="grid gap-2">
              <Label>{t('settings.security.verificationMode')}</Label>
              <Select
                value={form.emailVerification}
                onValueChange={(value: 'instant' | 'grace') => setForm((prev) => ({ ...prev, emailVerification: value }))}
                disabled={!canManage}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instant">{t('settings.security.instant')}</SelectItem>
                  <SelectItem value="grace">{t('settings.security.grace')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {form.emailVerification === 'instant'
                  ? t('settings.security.instantDesc')
                  : t('settings.security.graceDesc')}
              </p>
            </div>

            {form.emailVerification === 'grace' && (
              <div className="grid gap-2">
                <Label htmlFor="graceDays">{t('settings.security.gracePeriodDays')}</Label>
                <Input
                  id="graceDays"
                  type="number"
                  min={1}
                  max={365}
                  value={form.emailVerificationGraceDays}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      emailVerificationGraceDays: Math.max(1, Math.min(365, parseInt(e.target.value) || 7)),
                    }))
                  }
                  disabled={!canManage}
                  className="w-32"
                />
              </div>
            )}
          </div>

          {/* Save Button */}
          {canManage && (
            <div className="flex items-center gap-4 pt-4 border-t">
              <Button
                onClick={handleSave}
                loading={saveMutation.isPending}
              >
                {t('common:common.save')}
              </Button>
              {saved && (
                <span className="text-sm text-success-foreground">{t('settings.security.saved')}</span>
              )}
              {saveMutation.error && (
                <span className="text-sm text-destructive">{t('settings.security.saveError')}</span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Email Templates Card */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">{t('settings.security.emailTemplates')}</h3>
            <p className="text-xs text-muted-foreground mt-1">{t('settings.security.emailTemplatesDesc')}</p>
          </div>

          <Tabs
            tabs={templateTabs}
            value={activeTemplate}
            onChange={setActiveTemplate}
          />

          {/* Variables hint */}
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Tooltip
              content={
                <div className="space-y-1">
                  {currentVariables.map((v) => (
                    <div key={v}>
                      <span className="font-mono text-primary-foreground">{`{{${v}}}`}</span>
                      {' — '}
                      {t(`settings.security.variables.${v}`)}
                    </div>
                  ))}
                </div>
              }
              side="bottom"
            >
              <span className="inline-flex items-center gap-1 cursor-help border-b border-dashed border-muted-foreground/50">
                <Info size={12} />
                {t('settings.security.variables.title')}:
                {' '}
                <span className="font-mono">
                  {currentVariables.map((v) => `{{${v}}}`).join(', ')}
                </span>
              </span>
            </Tooltip>
          </div>

          <div className="space-y-3">
            {/* Subject */}
            <div className="grid gap-1.5">
              <Label htmlFor="template-subject">{t('settings.security.templateSubject')}</Label>
              <Input
                id="template-subject"
                value={getTemplateValue(activeTemplate, 'subject')}
                onChange={(e) => handleTemplateChange(activeTemplate, 'subject', e.target.value)}
                disabled={!canManage}
              />
            </div>

            {/* Body */}
            <div className="grid gap-1.5">
              <Label htmlFor="template-body">{t('settings.security.templateBody')}</Label>
              <textarea
                id="template-body"
                value={getTemplateValue(activeTemplate, 'body')}
                onChange={(e) => handleTemplateChange(activeTemplate, 'body', e.target.value)}
                disabled={!canManage}
                rows={8}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[120px] disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Reset / Save */}
            {canManage && (
              <div className="flex items-center gap-4 pt-2">
                <Button
                  onClick={handleSaveTemplates}
                  loading={saveTemplatesMutation.isPending}
                >
                  {t('common:common.save')}
                </Button>
                <button
                  type="button"
                  onClick={() => handleResetTemplate(activeTemplate)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('settings.security.resetToDefault')}
                </button>
                {templateSaved && (
                  <span className="text-sm text-success-foreground">{t('settings.security.templateSaved')}</span>
                )}
                {saveTemplatesMutation.error && (
                  <span className="text-sm text-destructive">{t('settings.security.templateSaveError')}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
