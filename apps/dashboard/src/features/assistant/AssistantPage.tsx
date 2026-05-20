import { useEffect, useState } from 'react';
import type { AssistantProfile, AssistantTone } from '@janetheoperator/shared';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import {
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

const TONES: readonly AssistantTone[] = ['Friendly', 'Professional', 'Concise'];

/**
 * Assistant persona — single page, single Save. These five fields drive the
 * system prompt the AI pipeline builds; auto-handoff rules are pipeline-side
 * concerns and will appear here when the pipeline supports them.
 */
export function AssistantPage() {
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
        <div className="p-6 text-sm text-muted">Loading…</div>
      </PageShell>
    );
  }

  const set = <K extends keyof AssistantProfile>(key: K, value: AssistantProfile[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const onSave = () => {
    save.mutate(form, {
      onSuccess: () => toast.success('Assistant settings saved'),
      onError: () => toast.error('Could not save. Check the highlighted fields.'),
    });
  };

  const details =
    save.error instanceof ApiError && save.error.details && typeof save.error.details === 'object'
      ? (save.error.details as Record<string, string>)
      : null;

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-8">
        <PageHeader
          title="Assistant"
          subtitle="Shape how the AI talks. These settings drive every reply."
        />

        <Card title="Persona">
          <Field label="Assistant name">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Tone">
            <SegmentedControl
              aria-label="Tone"
              options={TONES}
              value={form.tone}
              onChange={(v) => set('tone', v)}
            />
          </Field>
          <Field
            label="Instructions"
            hint="Extra guidance — what the assistant represents, what it should emphasise."
          >
            <Textarea
              rows={5}
              value={form.instructions}
              onChange={(e) => set('instructions', e.target.value)}
            />
          </Field>
        </Card>

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
          <Field
            label="Fallback message"
            hint="Sent when the assistant has no good answer."
          >
            <Textarea
              rows={3}
              value={form.fallback}
              onChange={(e) => set('fallback', e.target.value)}
            />
          </Field>
        </Card>

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
      </div>
    </PageShell>
  );
}
