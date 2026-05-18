import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { Button, Input, SegmentedControl, Switch } from '@/components/ui';

const TABS = ['Business', 'Your Profile', 'Notifications'] as const;
type Tab = (typeof TABS)[number];

const SLUG: Record<Tab, string> = {
  Business: 'business',
  'Your Profile': 'profile',
  Notifications: 'notifications',
};

const field =
  'w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent/40';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function BusinessTab() {
  return (
    <Section title="Business profile">
      <Field label="Company name">
        <Input defaultValue="Acme Co." />
      </Field>
      <Field label="Support email">
        <Input defaultValue="support@acme.co" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default language">
          <select className={field} defaultValue="en">
            <option value="en">English</option>
            <option value="de">German</option>
            <option value="fr">French</option>
          </select>
        </Field>
        <Field label="Timezone">
          <select className={field} defaultValue="cet">
            <option value="cet">Europe/Berlin (CET)</option>
            <option value="utc">UTC</option>
            <option value="pst">America/Los_Angeles</option>
          </select>
        </Field>
      </div>
      <Field label="Support hours">
        <Input defaultValue="Mon–Fri, 9:00–18:00" />
      </Field>
      <div className="flex justify-end">
        <Button size="md">Save changes</Button>
      </div>
    </Section>
  );
}

function AccountTab() {
  return (
    <Section title="Your profile">
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
    </Section>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState({ handoff: true, reply: true, summary: false });
  return (
    <Section title="Notifications">
      <Toggle
        label="Conversation handed to me"
        desc="When a chat is escalated or assigned to you."
        checked={prefs.handoff}
        onChange={(v) => setPrefs((p) => ({ ...p, handoff: v }))}
      />
      <Toggle
        label="Customer replied"
        desc="A customer responded in a chat you're handling."
        checked={prefs.reply}
        onChange={(v) => setPrefs((p) => ({ ...p, reply: v }))}
      />
      <Toggle
        label="Daily summary"
        desc="A morning digest of conversation volume and AI resolution rate."
        checked={prefs.summary}
        onChange={(v) => setPrefs((p) => ({ ...p, summary: v }))}
      />
    </Section>
  );
}

export function SettingsPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const tab = TABS.find((t) => SLUG[t] === section) ?? 'Business';
  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <header>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted">Manage your workspace and account.</p>
        </header>

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
