import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { BusinessProfile } from '@janetheoperator/shared';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import { Loading } from '@/components/Loading';
import {
  Input,
  Select,
  SelectItem,
  SearchableSelect,
  Field,
  Card,
  SaveButton,
  SegmentedControl,
  toast,
  Button,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useSession, useUpdateName, useChangePassword } from '@/features/auth/useAuth';
import { KnowledgeSettingsTab } from '@/features/knowledge/KnowledgeSettingsTab';
import { NotificationsCard } from '@/features/notifications/NotificationsCard';
import { useBusiness, useSaveBusiness } from './useBusiness';

const TABS = ['Business', 'Knowledge', 'Your Profile'] as const;
type Tab = (typeof TABS)[number];

const SLUG: Record<Tab, string> = {
  Business: 'business',
  Knowledge: 'knowledge',
  'Your Profile': 'profile',
};

/** Dropdown choices for the business default language. English first as
 *  the default; the rest alphabetised by English name. Native script
 *  appears in parens for non-Latin languages so operators can spot them
 *  in the open menu. The DB column accepts any BCP-47 string — a future
 *  "Other (custom)" affordance can be added here without backend work. */
const LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic (العربية)' },
  { value: 'bn', label: 'Bengali (বাংলা)' },
  { value: 'zh', label: 'Chinese (中文)' },
  { value: 'cs', label: 'Czech' },
  { value: 'da', label: 'Danish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'fil', label: 'Filipino' },
  { value: 'fi', label: 'Finnish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'el', label: 'Greek (Ελληνικά)' },
  { value: 'he', label: 'Hebrew (עברית)' },
  { value: 'hi', label: 'Hindi (हिन्दी)' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'id', label: 'Indonesian' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese (日本語)' },
  { value: 'ko', label: 'Korean (한국어)' },
  { value: 'no', label: 'Norwegian' },
  { value: 'fa', label: 'Persian / Farsi (فارسی)' },
  { value: 'pl', label: 'Polish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ro', label: 'Romanian' },
  { value: 'ru', label: 'Russian (Русский)' },
  { value: 'es', label: 'Spanish' },
  { value: 'sw', label: 'Swahili' },
  { value: 'sv', label: 'Swedish' },
  { value: 'th', label: 'Thai (ไทย)' },
  { value: 'tr', label: 'Turkish' },
  { value: 'uk', label: 'Ukrainian (Українська)' },
  { value: 'ur', label: 'Urdu (اردو)' },
  { value: 'vi', label: 'Vietnamese' },
];

function BusinessTab() {
  const { data, isLoading, isError } = useBusiness();
  const save = useSaveBusiness();

  // Hydrate once from the server; subsequent edits live on local state
  // until Save. setQueryData on save success keeps the cache in sync.
  const [form, setForm] = useState<BusinessProfile | null>(null);
  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  if (isError) {
    return <Card title="Business profile">Couldn't load business settings.</Card>;
  }
  if (isLoading || !form) {
    return (
      <Card title="Business profile">
        <Loading size={44} inline />
      </Card>
    );
  }

  const set = <K extends keyof BusinessProfile>(k: K, v: BusinessProfile[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const onSave = () =>
    save.mutate(form, {
      onSuccess: () => toast.success('Business settings saved'),
      onError: () => toast.error('Could not save. Check the highlighted fields.'),
    });

  const details =
    save.error instanceof ApiError && save.error.details && typeof save.error.details === 'object'
      ? (save.error.details as Record<string, string>)
      : null;

  return (
    <Card title="Business profile">
      <Field label="Business name">
        <Input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Acme Co."
        />
      </Field>
      <Field
        label="Support email"
        optional
        hint="Shown to customers when the AI hands off and a human isn't available right now."
      >
        <Input
          type="email"
          value={form.supportEmail ?? ''}
          onChange={(e) => set('supportEmail', e.target.value || null)}
          placeholder="support@yourdomain.com"
        />
      </Field>
      <Field
        label="Default language"
        hint="The language your team works in. The dashboard reads in this language; once translation is wired (next phase) the AI will reason in it too."
      >
        <SearchableSelect
          value={form.defaultLanguage}
          onValueChange={(v) => set('defaultLanguage', v)}
          options={LANGUAGES}
          searchPlaceholder="Search languages…"
        />
      </Field>

      {details && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-3 text-xs text-red-600">
          <ul className="space-y-1">
            {Object.entries(details).map(([field, msg]) => (
              <li key={field}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <SaveButton
          size="md"
          isPending={save.isPending}
          isSuccess={save.isSuccess}
          onSave={onSave}
        />
      </div>
    </Card>
  );
}

function AccountTab() {
  const { user } = useSession();
  const updateName = useUpdateName();
  const changePassword = useChangePassword();

  const [name, setName] = useState(user?.name ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const nameChanged = name.trim().length > 0 && name.trim() !== (user?.name ?? '');
  const passwordReady = current.length > 0 && next.length >= 8 && confirm.length > 0;

  const saveName = () =>
    updateName.mutate(
      { name: name.trim() },
      {
        onSuccess: () => toast.success('Name updated'),
        onError: () => toast.error('Could not update your name.'),
      },
    );

  const savePassword = () => {
    if (next !== confirm) {
      toast.error('New passwords don’t match.');
      return;
    }
    changePassword.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setConfirm('');
          toast.success('Password changed');
        },
        onError: (e) =>
          toast.error(
            e instanceof ApiError && e.message === 'invalid_password'
              ? 'Your current password is incorrect.'
              : 'Could not change password.',
          ),
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card title="Your profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email" hint="Contact an admin to change your email.">
            <Input value={user?.email ?? ''} disabled />
          </Field>
        </div>
        <div className="flex justify-end">
          <SaveButton
            size="md"
            idleLabel="Save name"
            isPending={updateName.isPending}
            isSuccess={updateName.isSuccess}
            onSave={saveName}
            disabled={!nameChanged}
          />
        </div>
      </Card>

      <Card title="Change password">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password">
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Confirm">
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button
            size="md"
            onClick={savePassword}
            disabled={!passwordReady || changePassword.isPending}
          >
            {changePassword.isPending ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </Card>

      <NotificationsCard />
    </div>
  );
}

export function SettingsPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  // Agents get only their own profile; admins get the workspace tabs too.
  const visibleTabs: readonly Tab[] = isAdmin ? TABS : ['Your Profile'];
  const tab = TABS.find((t) => SLUG[t] === section) ?? (isAdmin ? 'Business' : 'Your Profile');

  // Business + Knowledge are admin-only — route agents to their profile.
  if (!isAdmin && tab !== 'Your Profile') return <Navigate to="/settings/profile" replace />;

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <PageHeader
          title="Settings"
          subtitle={isAdmin ? 'Manage your workspace and account.' : 'Manage your account.'}
        />

        {visibleTabs.length > 1 && (
          <SegmentedControl
            aria-label="Settings sections"
            options={visibleTabs}
            value={tab}
            onChange={(t) => navigate(`/settings/${SLUG[t]}`)}
            className="-mx-4 mt-6 px-4 md:mx-0 md:px-0"
          />
        )}

        <div className="mt-6">
          {tab === 'Business' && <BusinessTab />}
          {tab === 'Knowledge' && <KnowledgeSettingsTab />}
          {tab === 'Your Profile' && <AccountTab />}
        </div>

        <p className="mt-10 text-center text-xs text-muted">
          Jane v{__APP_VERSION__} · build {__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC
        </p>
      </div>
    </PageShell>
  );
}
