import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { BusinessProfile } from '@janetheoperator/shared';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import {
  Input,
  Select,
  SelectItem,
  SearchableSelect,
  Field,
  Card,
  SaveButton,
  SwitchField,
  SegmentedControl,
  toast,
  Button,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useBusiness, useSaveBusiness } from './useBusiness';

const TABS = ['Business', 'Your Profile', 'Notifications'] as const;
type Tab = (typeof TABS)[number];

const SLUG: Record<Tab, string> = {
  Business: 'business',
  'Your Profile': 'profile',
  Notifications: 'notifications',
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
    return <Card title="Business profile">Loading…</Card>;
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
  return (
    <Card title="Your profile">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input defaultValue="Arash K." />
        </Field>
        <Field label="Email">
          <Input defaultValue="a.karimzadeh@gmail.com" disabled />
        </Field>
      </div>
      <div className="border-t border-line pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Change password
        </h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="New password">
            <Input type="password" placeholder="••••••••" />
          </Field>
          <Field label="Confirm password">
            <Input type="password" placeholder="••••••••" />
          </Field>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="md">Save changes</Button>
      </div>
    </Card>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState({ handoff: true, reply: true, summary: false });
  return (
    <Card title="Notifications">
      <SwitchField
        label="Conversation handed to me"
        desc="When a chat is escalated or assigned to you."
        checked={prefs.handoff}
        onCheckedChange={(v) => setPrefs((p) => ({ ...p, handoff: v }))}
      />
      <SwitchField
        label="Customer replied"
        desc="A customer responded in a chat you're handling."
        checked={prefs.reply}
        onCheckedChange={(v) => setPrefs((p) => ({ ...p, reply: v }))}
      />
      <SwitchField
        label="Daily summary"
        desc="A morning digest of conversation volume and AI resolution rate."
        checked={prefs.summary}
        onCheckedChange={(v) => setPrefs((p) => ({ ...p, summary: v }))}
      />
    </Card>
  );
}

export function SettingsPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const tab = TABS.find((t) => SLUG[t] === section) ?? 'Business';
  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <PageHeader title="Settings" subtitle="Manage your workspace and account." />

        <SegmentedControl
          aria-label="Settings sections"
          options={TABS}
          value={tab}
          onChange={(t) => navigate(`/settings/${SLUG[t]}`)}
          className="-mx-4 mt-6 px-4 md:mx-0 md:px-0"
        />

        <div className="mt-6">
          {tab === 'Business' && <BusinessTab />}
          {tab === 'Your Profile' && <AccountTab />}
          {tab === 'Notifications' && <NotificationsTab />}
        </div>
      </div>
    </PageShell>
  );
}
