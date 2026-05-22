import { type ReactNode } from 'react';
import { Card, SegmentedControl, Select, SelectItem, toast } from '@/components/ui';
import {
  useKbSettings,
  useSetMatchStrictness,
  useSetTopK,
  TOP_K_OPTIONS,
  type MatchStrictness,
  type TopK,
} from './useKnowledge';

const STRICTNESS_LABELS: Record<MatchStrictness, string> = {
  loose: 'Loose',
  balanced: 'Balanced',
  strict: 'Strict',
};
const STRICTNESS_VALUES = Object.values(STRICTNESS_LABELS); // ['Loose','Balanced','Strict']

/** Knowledge retrieval settings — match strictness + top-K. Rendered as the
 *  "Knowledge" tab on the Settings page (admin-only). Instant-save. */
export function KnowledgeSettingsTab() {
  const settings = useKbSettings();
  const setStrictness = useSetMatchStrictness();
  const setTopK = useSetTopK();
  const current = settings.data?.matchStrictness ?? 'balanced';
  const currentTopK = settings.data?.topK ?? 5;

  return (
    <Card title="Retrieval">
      <SettingRow
        label="Match strictness"
        desc="How closely a customer's question must match an entry for the AI to use it. Looser finds more answers; stricter is more precise."
      >
        <SegmentedControl
          aria-label="Match strictness"
          className="shrink-0"
          options={STRICTNESS_VALUES}
          value={STRICTNESS_LABELS[current]}
          onChange={(label) => {
            const level = (Object.keys(STRICTNESS_LABELS) as MatchStrictness[]).find(
              (k) => STRICTNESS_LABELS[k] === label,
            );
            if (level)
              setStrictness.mutate(level, {
                onSuccess: () => toast.success('Match strictness updated'),
                onError: () => toast.error('Could not update match strictness'),
              });
          }}
        />
      </SettingRow>

      <div className="h-px bg-line" />

      <SettingRow
        label="Results returned"
        desc="How many matching entries the AI sees per question. Fewer is more focused; more improves recall on multi-part questions but adds noise."
      >
        <Select
          aria-label="Results returned"
          className="w-24"
          value={String(currentTopK)}
          onValueChange={(v) =>
            setTopK.mutate(Number(v) as TopK, {
              onSuccess: () => toast.success('Results returned updated'),
              onError: () => toast.error('Could not update results returned'),
            })
          }
        >
          {TOP_K_OPTIONS.map((k) => (
            <SelectItem key={k} value={String(k)}>
              {k}
            </SelectItem>
          ))}
        </Select>
      </SettingRow>
    </Card>
  );
}

/** A single settings row: label + description on the left, control trailing on
 *  the right (stacks on mobile). */
function SettingRow({ label, desc, children }: { label: string; desc: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
