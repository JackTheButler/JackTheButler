import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ConfigField } from '@janetheoperator/shared';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import {
  Badge,
  Avatar,
  Button,
  Card,
  Field,
  Input,
  PasswordInput,
  SaveButton,
  Select,
  SelectItem,
  Switch,
  cn,
  toast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useApp, useCheckApp, useSaveAppConfig, useSetAppEnabled } from './useApps';
import { iconFor } from './icon';

/**
 * Generic config panel for any app without a custom UI. Renders fields from
 * the manifest, including the new `select` type. Reuses the same Status /
 * Switch / Save pattern as WebChat. Adds a real "Test connection" action
 * that calls the app's `check()` (e.g. ai-anthropic actually pings the API).
 */

function defaultFor(field: ConfigField): string {
  if (field.type === 'number') return '';
  return '';
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === 'select') {
    return (
      <Select value={value} onValueChange={onChange}>
        {field.options?.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </Select>
    );
  }
  if (field.type === 'password') {
    return (
      <PasswordInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
    );
  }
  const type = field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : 'text';
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
    />
  );
}

export function AppConfigPanel() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: detail, isLoading, isError } = useApp(id);
  const saveConfig = useSaveAppConfig(id);
  const setEnabled = useSetAppEnabled(id);
  const checkApp = useCheckApp(id);

  const [form, setForm] = useState<Record<string, string> | null>(null);
  // Verification of the SAVED config this session. Field edits don't change
  // saved config, so they don't change this flag. Refresh resets it (accepted).
  const [testedOk, setTestedOk] = useState(false);

  useEffect(() => {
    if (detail && !form) {
      const initial: Record<string, string> = {};
      for (const f of detail.manifest.configFields) {
        const v = (detail.config as Record<string, unknown>)[f.key];
        initial[f.key] = typeof v === 'string' ? v : defaultFor(f);
      }
      setForm(initial);
    }
  }, [detail, form]);

  if (isError) {
    return (
      <PageShell>
        <div className="p-6 text-sm text-muted">App not found.</div>
      </PageShell>
    );
  }
  if (isLoading || !detail || !form) {
    return (
      <PageShell>
        <div className="p-6 text-sm text-muted">Loading…</div>
      </PageShell>
    );
  }

  const live = detail.status === 'active';
  const hasError = !!detail.lastError;
  const name = detail.manifest.name;
  const isChannel = detail.manifest.category === 'channel';
  const turnOn = isChannel ? 'go live' : `activate ${name}`;
  // Configured == saved valid config (status anything but unconfigured), or
  // a runtime error (status='error' from lastError; config is fine, the app
  // just isn't reachable). Pure validate-fail is rare since saveConfig 400s
  // on it; treat that case as "not configured" for action visibility.
  const configured =
    detail.status === 'active' ||
    detail.status === 'disabled' ||
    (detail.status === 'error' && hasError);

  // Status is shown as a tag + detail in the strip (the PageHeader stays
  // clean — no duplicate badge there). Tone matches the tag's meaning.
  const statusLabel = hasError
    ? "Couldn't connect"
    : live
      ? 'Active'
      : detail.status === 'error'
        ? 'Invalid'
        : detail.status === 'disabled'
          ? 'Off'
          : 'Not configured';
  const statusTone: 'primary' | 'accent' | 'muted' = live
    ? 'primary'
    : detail.status === 'disabled'
      ? 'accent'
      : 'muted';
  const statusErrorTone = hasError || (detail.status === 'error' && !hasError);

  const statusDetail = hasError
    ? (detail.lastError ?? '')
    : detail.status === 'unconfigured'
      ? `Save valid settings to ${turnOn}.`
      : detail.status === 'error'
        ? `Fix the highlighted fields and save to ${turnOn}.`
        : !detail.enabled
          ? `Turn on to ${turnOn}.`
          : `${name} is ${isChannel ? 'live' : 'in use'}.`;

  // Two-line rule. `verified` = saved config trusted this session
  // (already running, or tested OK). Switch acts on the saved config;
  // Test verifies it. Edits don't affect either — they affect Save.
  const verified = detail.enabled || testedOk;
  const showSwitch = configured && verified;
  const showTest = configured && (hasError || !verified);

  const set = (k: string, v: string) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = () =>
    saveConfig.mutate(form, {
      onSuccess: (next) => {
        const name = detail.manifest.name;
        if (next.lastError) {
          // The reason is already shown in the Status strip — don't repeat it
          // in the toast.
          setTestedOk(false);
          toast.error(`${name} saved, but couldn't connect`);
        } else {
          // Save just auto-tested successfully → no need to gate Switch behind
          // a second Test click; user can flip on immediately.
          setTestedOk(true);
          toast.success(`${name} settings saved`);
        }
      },
      onError: () => toast.error('Could not save. Check the highlighted fields.'),
    });

  // Server persists the outcome in lastError; useCheckApp invalidates the
  // app query so the strip re-renders with the new truth.
  const runTest = () =>
    checkApp.mutate(undefined, {
      onSuccess: (data) => setTestedOk(Boolean(data?.ok)),
      onError: () => setTestedOk(false),
    });

  return (
    <PageShell>
      <div className="space-y-6 p-6">
        <PageHeader
          title={detail.manifest.name}
          subtitle={detail.manifest.description}
          icon={
            <Avatar
              size="md"
              shape="square"
              tone={live ? 'solid' : 'muted'}
              icon={
                iconFor(detail.manifest.id) ? (
                  <img
                    src={iconFor(detail.manifest.id)}
                    alt=""
                    className={cn('h-5 w-5 object-contain', live && 'invert')}
                  />
                ) : undefined
              }
              name={iconFor(detail.manifest.id) ? undefined : detail.manifest.name}
            />
          }
        />

        <Card title="Status">
          {/* Tag + detail on the left; ONE action on the right —
              Test (until verified) → Switch. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted">
              <Badge
                tone={statusTone}
                className={statusErrorTone ? 'text-red-600' : undefined}
              >
                {statusLabel}
              </Badge>
              <span className="min-w-0 break-words">{statusDetail}</span>
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {showTest && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={checkApp.isPending}
                  onClick={runTest}
                >
                  {checkApp.isPending ? 'Testing…' : 'Test connection'}
                </Button>
              )}
              {showSwitch && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted">
                    {detail.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <Switch
                    checked={detail.enabled}
                    aria-label={`Enable ${detail.manifest.name}`}
                    onCheckedChange={(v) =>
                      setEnabled.mutate(v, {
                        onSuccess: () =>
                          toast.success(
                            v
                              ? `${detail.manifest.name} enabled`
                              : `${detail.manifest.name} disabled`,
                          ),
                        onError: () => toast.error('Could not change status'),
                      })
                    }
                  />
                </label>
              )}
            </div>
          </div>
        </Card>

        <Card title="Settings">
          {detail.manifest.configFields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.placeholder}>
              <FieldControl field={f} value={form[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
            </Field>
          ))}

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
                    'Could not save. Please check the fields.'
                  )}
                </div>
              );
            })()}

          <div className="flex justify-end">
            <SaveButton
              size="md"
              isPending={saveConfig.isPending}
              isSuccess={saveConfig.isSuccess}
              onSave={save}
            />
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
