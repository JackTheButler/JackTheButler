import { useEffect, useState } from 'react';
import {
  ChatWidget,
  type WidgetMessage,
  type WidgetTheme,
} from '@janetheoperator/widget-ui';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import {
  Badge,
  Button,
  Card,
  ColorInput,
  Field,
  Input,
  Select,
  SelectItem,
  Switch,
  Textarea,
  toast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useApp, useSaveAppConfig, useSetAppEnabled } from './useApps';

/** Real webchat config — load/save/enable via the apps API (replaces the
 *  slice-1 local mock and the curl steps). */

const CANNED: WidgetMessage[] = [
  { id: '1', author: 'customer', content: 'Hi, do you offer annual billing?' },
  { id: '2', author: 'ai', content: 'Yes — annual billing saves 20% vs monthly.' },
];

const DEFAULTS = {
  title: 'Support',
  welcomeMessage: 'Hi 👋 How can we help?',
  accentColor: '#4f46e5',
  position: 'bottom-right',
  themeDefault: 'auto',
  allowedDomains: '',
};

type Form = typeof DEFAULTS;

export function WebchatConfigPanel() {
  const { data: detail, isLoading } = useApp('webchat');
  const saveConfig = useSaveAppConfig('webchat');
  const setEnabled = useSetAppEnabled('webchat');

  const [form, setForm] = useState<Form | null>(null);
  const [previewTheme, setPreviewTheme] = useState<WidgetTheme>('light');
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<WidgetMessage[]>(CANNED);
  const [copied, setCopied] = useState(false);

  // Initialise the form from server config once it arrives.
  useEffect(() => {
    if (detail && !form) {
      const c = detail.config as Partial<Form>;
      setForm({ ...DEFAULTS, ...c });
    }
  }, [detail, form]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const snippet = `<script src="${window.location.origin}/widget.js" data-jane-widget defer></script>`;
  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isLoading || !form || !detail) {
    return (
      <PageShell>
        <div className="p-6 text-sm text-muted">Loading…</div>
      </PageShell>
    );
  }

  const live = detail.status === 'active';
  const statusLabel = live
    ? 'Active'
    : detail.status === 'error'
      ? 'Invalid config'
      : detail.status === 'disabled'
        ? 'Disabled'
        : 'Not configured';
  const statusTone: 'primary' | 'accent' | 'muted' = live
    ? 'primary'
    : detail.status === 'disabled'
      ? 'accent'
      : 'muted';
  // The toggle only means something once config is saved + valid.
  const configured = detail.status === 'active' || detail.status === 'disabled';
  const statusText = !detail.enabled
    ? "Disabled — the widget won't load on any site."
    : live
      ? 'Active — live on your allowed domains.'
      : detail.status === 'error'
        ? 'Enabled, but the configuration is invalid — fix the highlighted fields and Save.'
        : 'Enabled, but not live yet — Save a valid configuration.';

  return (
    <PageShell>
      <div className="space-y-6 p-6">
        <PageHeader
          title="WebChat"
          subtitle="Configure the chat widget customers use on your website."
          action={
            <Badge
              tone={statusTone}
              className={detail.status === 'error' ? 'text-red-600' : undefined}
            >
              {statusLabel}
            </Badge>
          }
        />

        <Card title="Status">
          <div className="flex items-center justify-between gap-4">
            <p className="min-w-0 text-sm text-muted">{statusText}</p>
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <span className="text-muted">
                {!configured ? 'Configure first' : detail.enabled ? 'Enabled' : 'Disabled'}
              </span>
              <Switch
                checked={detail.enabled}
                disabled={!configured}
                aria-label="Enable WebChat"
                onCheckedChange={(v) =>
                  setEnabled.mutate(v, {
                    onSuccess: () =>
                      toast.success(v ? 'WebChat enabled' : 'WebChat disabled'),
                    onError: () => toast.error('Could not change status'),
                  })
                }
              />
            </label>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Widget settings">
            <Field label="Title">
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label="Welcome message">
              <Textarea
                rows={2}
                value={form.welcomeMessage}
                onChange={(e) => set('welcomeMessage', e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Accent color">
                <ColorInput value={form.accentColor} onChange={(v) => set('accentColor', v)} />
              </Field>
              <Field label="Position">
                <Select
                  value={form.position}
                  onValueChange={(v) => set('position', v)}
                >
                  <SelectItem value="bottom-right">Bottom right</SelectItem>
                  <SelectItem value="bottom-left">Bottom left</SelectItem>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default theme">
                <Select
                  value={form.themeDefault}
                  onValueChange={(v) => set('themeDefault', v)}
                >
                  <SelectItem value="auto">Auto (visitor’s system)</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </Select>
              </Field>
            </div>
            <Field
              label="Allowed domains"
              hint="Comma/newline separated. Domain, host:port, or full URL (scheme/port ignored), e.g. localhost, example.com."
            >
              <Textarea
                rows={3}
                value={form.allowedDomains}
                onChange={(e) => set('allowedDomains', e.target.value)}
              />
            </Field>
            {saveConfig.isError &&
              (() => {
                const err = saveConfig.error;
                const details =
                  err instanceof ApiError && err.details && typeof err.details === 'object'
                    ? (err.details as Record<string, string>)
                    : null;
                return (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-3 text-xs text-red-600">
                    {details ? (
                      <ul className="space-y-1">
                        {Object.entries(details).map(([field, msg]) => (
                          <li key={field}>
                            <span className="font-semibold">{field}:</span> {msg}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      'Could not save — please check the fields.'
                    )}
                  </div>
                );
              })()}
            <div className="flex items-center justify-end gap-3">
              <Button
                size="md"
                disabled={saveConfig.isPending}
                onClick={() =>
                  saveConfig.mutate(form, {
                    onSuccess: () => toast.success('WebChat settings saved'),
                    onError: () =>
                      toast.error('Could not save — check the highlighted fields'),
                  })
                }
              >
                {saveConfig.isPending ? 'Saving…' : saveConfig.isSuccess ? 'Saved' : 'Save'}
              </Button>
            </div>
          </Card>

          <div className="space-y-6">
            <Card title="Live preview">
              <Field label="Preview theme">
                <Select
                  value={previewTheme}
                  onValueChange={(v) => setPreviewTheme(v as WidgetTheme)}
                >
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </Select>
              </Field>
              <div
                className="relative h-[620px] overflow-hidden rounded-xl border border-line"
                style={{ background: previewTheme === 'dark' ? '#0c0d0f' : '#fafafa' }}
              >
                <ChatWidget
                  inline
                  theme={previewTheme}
                  config={{
                    title: form.title,
                    welcomeMessage: form.welcomeMessage,
                    accentColor: form.accentColor,
                    position: form.position as 'bottom-right' | 'bottom-left',
                  }}
                  messages={messages}
                  open={open}
                  onToggle={() => setOpen((o) => !o)}
                  onSend={(text) =>
                    setMessages((m) => [
                      ...m,
                      { id: String(Date.now()), author: 'customer', content: text },
                    ])
                  }
                />
              </div>
            </Card>

            <Card title="Install">
              <p className="text-sm text-muted">
                Paste this before <code>&lt;/body&gt;</code> on your site.
              </p>
              <pre className="overflow-x-auto rounded-lg border border-line bg-surface p-3 text-xs">
                {snippet}
              </pre>
              <div className="flex justify-end">
                <Button size="md" onClick={copy}>
                  {copied ? 'Copied' : 'Copy snippet'}
                </Button>
              </div>
              <div className="space-y-1.5 border-t border-line pt-4 text-xs text-muted">
                <p className="font-medium text-ink">Theme</p>
                <p>By default the widget matches each visitor’s system light/dark setting.</p>
                <p>
                  To force one, add{' '}
                  <code className="rounded bg-surface px-1">data-jane-theme="dark"</code> (or{' '}
                  <code className="rounded bg-surface px-1">light</code> /{' '}
                  <code className="rounded bg-surface px-1">auto</code>) to the script tag.
                </p>
                <p>
                  If your site has its own theme switch, call{' '}
                  <code className="rounded bg-surface px-1">JaneWidget.setTheme('dark')</code>{' '}
                  from it.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
