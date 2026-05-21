import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, AlertCircle, BookOpen } from 'lucide-react';
import type { KnowledgeEntry } from '@janetheoperator/shared';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  EmptyState,
  Field,
  Input,
  SaveButton,
  SearchInput,
  Select,
  SelectItem,
  Textarea,
  toast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useApps } from '@/features/apps/useApps';
import {
  useAddEntry,
  useDeleteEntry,
  useKnowledgeEntries,
  useUpdateEntry,
  type EntryInput,
} from './useKnowledge';

/**
 * KB management — flat list of Q&A entries, manual add/edit/delete.
 * AI-extraction from pasted blobs lands in a follow-on slice.
 */

const ALL_TOPICS = '__all__';

export function KnowledgeBasePage() {
  const { data, isLoading, isError } = useKnowledgeEntries();
  const apps = useApps();

  const [query, setQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState<string>(ALL_TOPICS);
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [adding, setAdding] = useState(false);

  const entries = data?.entries ?? [];
  const embeddingAppActive =
    (apps.data?.apps ?? []).some((a) => a.category === 'embedding' && a.status === 'active');

  const topics = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) if (e.topic) set.add(e.topic);
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (topicFilter !== ALL_TOPICS && e.topic !== topicFilter) return false;
      if (!q) return true;
      return (
        e.question.toLowerCase().includes(q) ||
        e.answer.toLowerCase().includes(q) ||
        (e.topic ?? '').toLowerCase().includes(q)
      );
    });
  }, [entries, query, topicFilter]);

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <PageHeader
          title="Knowledge"
          subtitle="Q&A entries the AI searches when a customer asks something."
          action={
            <Button size="md" onClick={() => setAdding(true)}>
              <Plus size={16} />
              Add entry
            </Button>
          }
        />

        {!embeddingAppActive && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Embedding provider not connected.</p>
              <p className="text-xs opacity-90">
                Entries you add will be saved but won't be searchable by the AI until you
                connect an embedding provider in{' '}
                <a href="/apps" className="underline">
                  Apps
                </a>
                .
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search question, answer, or topic…"
            className="w-full sm:w-72"
          />
          {topics.length > 0 && (
            <Select value={topicFilter} onValueChange={setTopicFilter}>
              <SelectItem value={ALL_TOPICS}>All topics</SelectItem>
              {topics.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </Select>
          )}
        </div>

        <div className="mt-6">
          {isError ? (
            <EmptyState>Couldn't load entries.</EmptyState>
          ) : isLoading ? (
            <EmptyState>Loading…</EmptyState>
          ) : entries.length === 0 ? (
            <EmptyState>
              <div className="flex flex-col items-center gap-3">
                <BookOpen size={28} className="text-muted" />
                <div className="text-center">
                  <p className="text-sm font-medium text-ink">No knowledge yet</p>
                  <p className="mt-1 text-xs text-muted">
                    Add Q&A entries to help the AI answer common questions.
                  </p>
                </div>
                <Button size="md" onClick={() => setAdding(true)}>
                  <Plus size={16} />
                  Add the first entry
                </Button>
              </div>
            </EmptyState>
          ) : filtered.length === 0 ? (
            <EmptyState>No entries match your filters.</EmptyState>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-panel">
              <ul className="divide-y divide-line">
                {filtered.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} onEdit={() => setEditing(entry)} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <EntryDialog
        open={adding}
        onOpenChange={setAdding}
        topics={topics}
      />
      <EntryDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        topics={topics}
        existing={editing}
      />
    </PageShell>
  );
}

function EntryRow({
  entry,
  onEdit,
}: {
  entry: KnowledgeEntry;
  onEdit: () => void;
}) {
  const del = useDeleteEntry();
  const onDelete = () => {
    if (!window.confirm('Delete this entry?')) return;
    del.mutate(entry.id, {
      onSuccess: () => toast.success('Entry deleted'),
      onError: () => toast.error('Could not delete entry'),
    });
  };
  return (
    <li className="flex items-start gap-3 p-3 sm:p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className="truncate text-sm font-medium text-ink"
            dir="auto"
            title={entry.question}
          >
            {entry.question}
          </p>
          {entry.topic && (
            <Badge tone="muted" shape="tag" className="shrink-0">
              {entry.topic}
            </Badge>
          )}
          {!entry.hasEmbedding && (
            <Badge
              tone="muted"
              shape="tag"
              className="shrink-0 text-amber-600"
              title="No embedding — this entry won't surface in AI replies until an embedding provider is connected."
            >
              No embedding
            </Badge>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted" dir="auto">
          {entry.answer}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit">
          <Pencil size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={del.isPending}
          aria-label="Delete"
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </li>
  );
}

function EntryDialog({
  open,
  onOpenChange,
  topics,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics: string[];
  existing?: KnowledgeEntry | null;
}) {
  const isEdit = !!existing;
  const add = useAddEntry();
  const update = useUpdateEntry();
  const save = isEdit ? update : add;

  const [form, setForm] = useState<EntryInput>({
    question: '',
    answer: '',
    topic: null,
  });

  // Reset / hydrate on open / existing change.
  useEffect(() => {
    if (open) {
      setForm({
        question: existing?.question ?? '',
        answer: existing?.answer ?? '',
        topic: existing?.topic ?? null,
      });
    }
  }, [open, existing]);

  const set = <K extends keyof EntryInput>(k: K, v: EntryInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSave = () => {
    const payload: EntryInput = {
      question: form.question.trim(),
      answer: form.answer.trim(),
      topic: form.topic && form.topic.trim() ? form.topic.trim() : null,
    };
    const promise = isEdit
      ? update.mutateAsync({ id: existing!.id, ...payload })
      : add.mutateAsync(payload);
    promise
      .then(() => {
        toast.success(isEdit ? 'Entry updated' : 'Entry added');
        onOpenChange(false);
      })
      .catch(() => {
        toast.error('Could not save entry.');
      });
  };

  const details =
    save.error instanceof ApiError && save.error.details && typeof save.error.details === 'object'
      ? (save.error.details as Record<string, string>)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={isEdit ? 'Edit knowledge entry' : 'New knowledge entry'}
        className="max-w-xl"
      >
        <p className="text-xs text-muted">
          The AI matches a customer's question against the <strong>Question</strong> and replies
          with the <strong>Answer</strong>.
        </p>

        <div className="mt-4 space-y-4">
          <Field label="Question" hint="What a customer might ask. Used for retrieval matching.">
            <Textarea
              rows={2}
              value={form.question}
              onChange={(e) => set('question', e.target.value)}
              placeholder="e.g. How do I get a refund?"
              dir="auto"
            />
          </Field>

          <Field label="Answer" hint="What the AI will tell the customer.">
            <Textarea
              rows={5}
              value={form.answer}
              onChange={(e) => set('answer', e.target.value)}
              placeholder="e.g. Refunds within 30 days. Email support@…"
              dir="auto"
            />
          </Field>

          <Field label="Topic" optional hint="Optional. Used to group entries (e.g. Shipping).">
            <Input
              value={form.topic ?? ''}
              onChange={(e) => set('topic', e.target.value || null)}
              placeholder={topics.length > 0 ? `e.g. ${topics[0]}` : 'e.g. Shipping'}
              list="knowledge-topics"
            />
            <datalist id="knowledge-topics">
              {topics.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>

          {details && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-3 text-xs text-red-600">
              <ul className="space-y-1">
                {Object.entries(details).map(([k, v]) => (
                  <li key={k}>{v}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="md">
              Cancel
            </Button>
          </DialogClose>
          <SaveButton
            size="md"
            isPending={save.isPending}
            isSuccess={save.isSuccess}
            onSave={onSave}
            idleLabel={isEdit ? 'Save changes' : 'Add entry'}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

