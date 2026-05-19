import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import {
  Button,
  Input,
  Select,
  SelectItem,
  Textarea,
  Field,
  Card,
  SwitchField,
  SegmentedControl,
} from '@/components/ui';

const TABS = ['Persona', 'Fallback', 'Boundaries'] as const;
type Tab = (typeof TABS)[number];
const SLUG: Record<Tab, string> = {
  Persona: 'persona',
  Fallback: 'fallback',
  Boundaries: 'boundaries',
};

function PersonaTab() {
  const [tone, setTone] = useState<'Friendly' | 'Professional' | 'Concise'>('Friendly');
  return (
    <Card title="Persona & tone">
      <Field label="Assistant name">
        <Input defaultValue="Jane" />
      </Field>
      <Field label="Instructions" hint="How the assistant should behave and what it represents.">
        <Textarea
          rows={5}
          defaultValue="You are Jane, the support assistant for Acme Co. Be helpful and accurate. If you are unsure, say so and offer to connect a human."
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
        <Select defaultValue="auto">
          <SelectItem value="auto">Auto-detect from the customer</SelectItem>
          <SelectItem value="en">Always English</SelectItem>
          <SelectItem value="de">Always German</SelectItem>
          <SelectItem value="fr">Always French</SelectItem>
        </Select>
      </Field>
      <div className="flex justify-end">
        <Button size="md">Save changes</Button>
      </div>
    </Card>
  );
}

function FallbackTab() {
  const [rules, setRules] = useState({ askHuman: false, lowConfidence: false, sentiment: false });
  return (
    <Card title="Fallback & escalation">
      <Field label="Fallback message" hint="Sent when the assistant has no good answer.">
        <Textarea
          rows={3}
          defaultValue="I'm not certain about that — let me get a teammate to help you."
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
          <SwitchField
            label="Customer asks for a human"
            desc="Escalate when the customer explicitly requests a person."
            checked={rules.askHuman}
            onCheckedChange={(v) => setRules((r) => ({ ...r, askHuman: v }))}
          />
          <SwitchField
            label="Low confidence"
            desc="Escalate when the AI is unsure of its answer."
            checked={rules.lowConfidence}
            onCheckedChange={(v) => setRules((r) => ({ ...r, lowConfidence: v }))}
          />
          {rules.lowConfidence && (
            <div className="pb-2 pl-1">
              <Field label="Sensitivity">
                <Select defaultValue="medium">
                  <SelectItem value="low">Low — escalate only when very unsure</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High — escalate at any doubt</SelectItem>
                </Select>
              </Field>
            </div>
          )}
          <SwitchField
            label="Negative sentiment"
            desc="Escalate when the customer seems frustrated or upset."
            checked={rules.sentiment}
            onCheckedChange={(v) => setRules((r) => ({ ...r, sentiment: v }))}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="md">Save changes</Button>
      </div>
    </Card>
  );
}

function BoundariesTab() {
  return (
    <Card title="Boundaries">
      <Field label="Topics to avoid" hint="The assistant will decline these and offer a human.">
        <Textarea
          rows={3}
          placeholder="e.g. legal advice, refunds over $500, anything about competitors"
        />
      </Field>
      <Field label="Never say">
        <Textarea rows={3} placeholder="Phrases or claims the assistant must never make" />
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
    </Card>
  );
}


export function AssistantPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const tab = TABS.find((t) => SLUG[t] === section) ?? 'Persona';

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <PageHeader title="Assistant" subtitle="Shape how the AI talks and when it hands off." />

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
