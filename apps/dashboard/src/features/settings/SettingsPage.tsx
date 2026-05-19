import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import {
  Button,
  Input,
  Select,
  SelectItem,
  Field,
  Card,
  SwitchField,
  SegmentedControl,
} from '@/components/ui';

const TABS = ['Business', 'Your Profile', 'Notifications'] as const;
type Tab = (typeof TABS)[number];

const SLUG: Record<Tab, string> = {
  Business: 'business',
  'Your Profile': 'profile',
  Notifications: 'notifications',
};

function BusinessTab() {
  return (
    <Card title="Business profile">
      <Field label="Company name">
        <Input defaultValue="Acme Co." />
      </Field>
      <Field label="Support email">
        <Input defaultValue="support@acme.co" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default language">
          <Select defaultValue="en">
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="de">German</SelectItem>
            <SelectItem value="fr">French</SelectItem>
          </Select>
        </Field>
        <Field label="Timezone">
          <Select defaultValue="cet">
            <SelectItem value="cet">Europe/Berlin (CET)</SelectItem>
            <SelectItem value="utc">UTC</SelectItem>
            <SelectItem value="pst">America/Los_Angeles</SelectItem>
          </Select>
        </Field>
      </div>
      <Field label="Support hours">
        <Input defaultValue="Mon–Fri, 9:00–18:00" />
      </Field>
      <div className="flex justify-end">
        <Button size="md">Save changes</Button>
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
