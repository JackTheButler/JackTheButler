import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AssistantProfile, AssistantTone, ResponseLength } from '@janetheoperator/shared';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import { Loading } from '@/components/Loading';
import {
  Alert,
  Card,
  Field,
  Input,
  SaveButton,
  SegmentedControl,
  Textarea,
  toast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAssistant, useSaveAssistant } from './useAssistant';

const TONES: readonly AssistantTone[] = ['Friendly', 'Professional', 'Casual'];

// Verbosity, distinct from tone. Labels are title-case for display; the stored
// value is the lowercase ResponseLength.
const LENGTHS: readonly { value: ResponseLength; label: string }[] = [
  { value: 'brief', label: 'Brief' },
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Detailed' },
];

const TABS = ['Persona', 'Boundaries'] as const;
type Tab = (typeof TABS)[number];
const SLUG: Record<Tab, string> = { Persona: 'persona', Boundaries: 'boundaries' };

// Which profile fields each tab owns. A tab's Save sends only these, so the
// PUT (which merges) leaves the other tab's fields untouched.
const TAB_FIELDS: Record<Tab, readonly (keyof AssistantProfile)[]> = {
  Persona: ['name', 'tone', 'responseLength', 'instructions'],
  Boundaries: ['topicsToAvoid', 'fallback'],
};

/**
 * Assistant persona, split into Persona / Boundaries tabs. The profile is a
 * single row, so both tabs edit one shared form and each tab's Save persists
 * the whole profile (the backend PUT is full-document) — switching tabs never
 * loses edits. These fields drive the system prompt the AI pipeline builds.
 */
export function AssistantPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const tab = TABS.find((t) => SLUG[t] === section) ?? 'Persona';

  const { data, isLoading, isError } = useAssistant();
  const save = useSaveAssistant();

  const [form, setForm] = useState<AssistantProfile | null>(null);

  // Hydrate once from the server. Subsequent saves update the query cache
  // via setQueryData — we keep editing our local copy until the user saves.
  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  if (isError) {
    return (
      <PageShell>
        <div className="p-6 text-sm text-muted">Couldn't load assistant settings.</div>
      </PageShell>
    );
  }
  if (isLoading || !form) {
    return (
      <PageShell>
        <Loading />
      </PageShell>
    );
  }

  const set = <K extends keyof AssistantProfile>(key: K, value: AssistantProfile[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const onSave = () => {
    // Send only the active tab's fields; the PUT merges, leaving the rest.
    const patch = Object.fromEntries(
      TAB_FIELDS[tab].map((k) => [k, form[k]]),
    ) as Partial<AssistantProfile>;
    save.mutate(patch, {
      onSuccess: () => toast.success(`${tab} saved`),
      onError: () => toast.error('Could not save. Check the highlighted fields.'),
    });
  };

  const details =
    save.error instanceof ApiError && save.error.details && typeof save.error.details === 'object'
      ? (save.error.details as Record<string, string>)
      : null;

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <PageHeader
          title="Assistant"
          subtitle="Shape how the AI talks. These settings drive every reply."
        />

        <SegmentedControl
          aria-label="Assistant sections"
          options={TABS}
          value={tab}
          onChange={(t) => navigate(`/assistant/${SLUG[t]}`)}
          className="-mx-4 mt-6 flex min-h-[2.375rem] items-center px-4 md:mx-0 md:px-0"
        />

        <div className="mt-6 space-y-6">
          {tab === 'Persona' ? (
            <Card title="Persona">
              <Field label="Assistant name">
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Tone" hint="How the assistant sounds.">
                <SegmentedControl
                  aria-label="Tone"
                  options={TONES}
                  value={form.tone}
                  onChange={(v) => set('tone', v)}
                />
              </Field>
              <Field label="Response length" hint="How much the assistant says per reply.">
                <SegmentedControl
                  aria-label="Response length"
                  options={LENGTHS.map((l) => l.label)}
                  value={LENGTHS.find((l) => l.value === form.responseLength)?.label ?? 'Standard'}
                  onChange={(label) => {
                    const match = LENGTHS.find((l) => l.label === label);
                    if (match) set('responseLength', match.value);
                  }}
                />
              </Field>
              <Field
                label="Instructions"
                hint="Extra guidance: what the assistant represents and what it should emphasise."
              >
                <Textarea
                  rows={5}
                  value={form.instructions}
                  onChange={(e) => set('instructions', e.target.value)}
                />
              </Field>
            </Card>
          ) : (
            <Card title="Boundaries & fallback">
              <Field
                label="Topics to avoid"
                hint="The assistant will politely decline these and offer a human."
              >
                <Textarea
                  rows={3}
                  value={form.topicsToAvoid}
                  onChange={(e) => set('topicsToAvoid', e.target.value)}
                  placeholder="e.g. legal advice, refunds over $500, anything about competitors"
                />
              </Field>
              <Field label="Fallback message" hint="Sent when the assistant has no good answer.">
                <Textarea
                  rows={3}
                  value={form.fallback}
                  onChange={(e) => set('fallback', e.target.value)}
                />
              </Field>
            </Card>
          )}

          {details && (
            <Alert variant="error">
              <ul className="space-y-1">
                {Object.entries(details).map(([field, msg]) => (
                  <li key={field}>{msg}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="flex justify-end">
            <SaveButton
              size="md"
              isPending={save.isPending}
              isSuccess={save.isSuccess}
              onSave={onSave}
            />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
