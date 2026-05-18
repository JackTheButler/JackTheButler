import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { Button, Input, SegmentedControl, Switch, cn } from '@/components/ui';

const TABS = ['Persona', 'Fallback', 'Boundaries'] as const;
type Tab = (typeof TABS)[number];
const SLUG: Record<Tab, string> = {
  Persona: 'persona',
  Fallback: 'fallback',
  Boundaries: 'boundaries',
};

const field =
  'w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent/40';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
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

function SwitchRow({
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

function PersonaTab() {
  const [tone, setTone] = useState<'Friendly' | 'Professional' | 'Concise'>('Friendly');
  return (
    <Section title="Persona & tone">
      <Field label="Assistant name">
        <Input defaultValue="Jane" />
      </Field>
      <Field label="Instructions" hint="How the assistant should behave and what it represents.">
        <textarea
          rows={5}
          defaultValue="You are Jane, the support assistant for Acme Co. Be helpful and accurate. If you are unsure, say so and offer to connect a human."
          className={cn(field, 'resize-none')}
        />
      </Field>
      <Field label="Tone">
        <SegmentedControl
          aria-label="Tone"
          options={['Friendly', 'Professional', 'Concise'] as const}
          value={tone}
          onChange={setTone}
        />
      </Field>
      <Field label="Reply language">
        <select className={field} defaultValue="auto">
          <option value="auto">Auto-detect from the customer</option>
          <option value="en">Always English</option>
          <option value="de">Always German</option>
          <option value="fr">Always French</option>
        </select>
      </Field>
      <div className="flex justify-end">
        <Button size="md">Save changes</Button>
      </div>
    </Section>
  );
}

function FallbackTab() {
  const [rules, setRules] = useState({ askHuman: false, lowConfidence: false, sentiment: false });
  return (
    <Section title="Fallback & escalation">
      <Field label="Fallback message" hint="Sent when the assistant has no good answer.">
        <textarea
          rows={3}
          defaultValue="I'm not certain about that — let me get a teammate to help you."
          className={cn(field, 'resize-none')}
        />
      </Field>

      <div className="border-t border-line pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Auto hand-off to a human
        </h3>
        <p className="mt-1 text-xs text-muted">
          Off = conversations stay with the AI until a teammate takes over manually.
        </p>
        <div className="mt-2">
          <SwitchRow
            label="Customer asks for a human"
            desc="Escalate when the customer explicitly requests a person."
            checked={rules.askHuman}
            onChange={(v) => setRules((r) => ({ ...r, askHuman: v }))}
          />
          <SwitchRow
            label="Low confidence"
            desc="Escalate when the AI is unsure of its answer."
            checked={rules.lowConfidence}
            onChange={(v) => setRules((r) => ({ ...r, lowConfidence: v }))}
          />
          {rules.lowConfidence && (
            <div className="pb-2 pl-1">
              <Field label="Sensitivity">
                <select className={field} defaultValue="medium">
                  <option value="low">Low — escalate only when very unsure</option>
                  <option value="medium">Medium</option>
                  <option value="high">High — escalate at any doubt</option>
                </select>
              </Field>
            </div>
          )}
          <SwitchRow
            label="Negative sentiment"
            desc="Escalate when the customer seems frustrated or upset."
            checked={rules.sentiment}
            onChange={(v) => setRules((r) => ({ ...r, sentiment: v }))}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="md">Save changes</Button>
      </div>
    </Section>
  );
}

function BoundariesTab() {
  return (
    <Section title="Boundaries">
      <Field label="Topics to avoid" hint="The assistant will decline these and offer a human.">
        <textarea
          rows={3}
          placeholder="e.g. legal advice, refunds over $500, anything about competitors"
          className={cn(field, 'resize-none')}
        />
      </Field>
      <Field label="Never say">
        <textarea
          rows={3}
          placeholder="Phrases or claims the assistant must never make"
          className={cn(field, 'resize-none')}
        />
      </Field>
      <Field label="Max response length">
        <SegmentedControl
          aria-label="Max response length"
          options={['Short', 'Medium', 'Long'] as const}
          value="Medium"
          onChange={() => {}}
        />
      </Field>
      <div className="flex justify-end">
        <Button size="md">Save changes</Button>
      </div>
    </Section>
  );
}


export function AssistantPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const tab = TABS.find((t) => SLUG[t] === section) ?? 'Persona';

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <header>
          <h1 className="text-lg font-semibold">Assistant</h1>
          <p className="mt-1 text-sm text-muted">Shape how the AI talks and when it hands off.</p>
        </header>

        <SegmentedControl
          aria-label="Assistant sections"
          options={TABS}
          value={tab}
          onChange={(t) => navigate(`/assistant/${SLUG[t]}`)}
          className="-mx-4 mt-6 px-4 md:mx-0 md:px-0"
        />

        <div className="mt-6">
          {tab === 'Persona' && <PersonaTab />}
          {tab === 'Fallback' && <FallbackTab />}
          {tab === 'Boundaries' && <BoundariesTab />}
        </div>
      </div>
    </PageShell>
  );
}
