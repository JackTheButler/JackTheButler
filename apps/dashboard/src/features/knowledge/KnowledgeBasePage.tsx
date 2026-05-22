import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Pencil,
  AlertCircle,
  BookOpen,
  RefreshCw,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Globe,
} from 'lucide-react';
import type { KnowledgeEntry } from '@janetheoperator/shared';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import { Toolbar } from '@/components/Toolbar';
import { Pagination } from '@/components/Pagination';
import { JobProgress } from '@/components/JobProgress';
import { Loading } from '@/components/Loading';
import { useSession } from '@/features/auth/useAuth';
import { ImportDialog } from './import/ImportDialog';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  SaveButton,
  SearchInput,
  SearchableSelect,
  Select,
  SelectItem,
  Textarea,
  toast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useJob } from '@/lib/useJob';
import { useStatus } from '@/lib/useStatus';
import {
  useAddEntry,
  useDeleteEntry,
  useEmbeddingCounts,
  useKnowledgeEntries,
  useReembed,
  useUpdateEntry,
  type EntryInput,
} from './useKnowledge';

/**
 * Knowledge feature — the Q&A entry list (search, add/edit/delete, bulk
 * import, re-embed). Retrieval *settings* (strictness, top-K) live on the
 * Settings page now (the "Knowledge" tab), not here.
 */

const ALL_TOPICS = '__all__';
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

// Bulk-add sources surfaced in the "Add entry" split-button menu. Only `excel`
// is wired up; the rest are roadmap placeholders (disabled in the menu).
type ImportSource = 'excel';

export function KnowledgeBasePage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <EntriesTab />
      </div>
    </PageShell>
  );
}

/** Page header for the entries view. `action` is the right-side primary
 *  action (Add entry / Re-embed all). */
function KnowledgeHeader({ action }: { action?: ReactNode }) {
  return (
    <PageHeader
      title="Knowledge"
      subtitle="Q&A entries the AI searches when a customer asks something."
      action={action}
    />
  );
}

/**
 * Primary "Add entry" action as a split button: the main face writes one
 * entry by hand; the chevron opens a menu of bulk-add sources. New sources
 * (PDF, URL) drop in as menu items — shown disabled with a "Soon" badge until
 * they're built, so the structure is visible without dead actions.
 */
function AddEntrySplitButton({
  onAdd,
  onImport,
}: {
  onAdd: () => void;
  onImport: (source: ImportSource) => void;
}) {
  return (
    <div className="inline-flex">
      <Button size="md" className="rounded-r-none" onClick={onAdd}>
        <Plus size={16} />
        Add entry
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="md"
            aria-label="More ways to add"
            className="rounded-l-none border-l border-on-accent/25 px-2"
          >
            <ChevronDown size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Add from</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => onImport('excel')}>
            <FileSpreadsheet size={16} />
            Excel or CSV
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <FileText size={16} />
            PDF
            <Badge tone="muted" className="ml-auto">
              Soon
            </Badge>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Globe size={16} />
            Website URL
            <Badge tone="muted" className="ml-auto">
              Soon
            </Badge>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function EntriesTab() {
  const { data, isLoading, isError } = useKnowledgeEntries();
  // Status (not the admin-only Apps endpoint) so agents get the right hint
  // without a 403.
  const status = useStatus();
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';

  const qc = useQueryClient();
  const counts = useEmbeddingCounts();
  const reembed = useReembed();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);

  const [query, setQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState<string>(ALL_TOPICS);
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const entries = data?.entries ?? [];
  const embeddingAppActive = status.data?.providers.embedding.connected ?? false;
  const missingCount = counts.data?.missing ?? 0;
  const totalCount = counts.data?.total ?? 0;

  useEffect(() => {
    if (job?.state === 'done' || job?.state === 'cancelled' || job?.state === 'error') {
      qc.invalidateQueries({ queryKey: ['knowledge'] });
    }
  }, [job?.state, qc]);

  const startReembed = (scope: 'missing' | 'all' = 'missing') =>
    reembed.mutate(scope, {
      onSuccess: (j) => setJobId(j.id),
      onError: () => toast.error('Could not start re-embedding.'),
    });

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

  // Client-side display pagination: filter first, then show one page. Reset to
  // page 1 when the filter or page size changes; clamp so a shrinking list
  // (delete) can never strand us past the last page.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  useEffect(() => setPage(1), [query, topicFilter, pageSize]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Active tab's primary actions, rendered in the shared header (right side).
  const actions = (
    <div className="flex flex-wrap justify-end gap-2">
      {/* Re-embed everything — after a model/embedding-scheme change (vectors
          need rebuilding). Hidden while a job runs or there's nothing to embed. */}
      {embeddingAppActive && totalCount > 0 && !(job && job.state === 'running') && (
        <Button
          variant="outline"
          size="md"
          onClick={() => startReembed('all')}
          disabled={reembed.isPending}
          title="Rebuild embeddings for every entry"
        >
          <RefreshCw size={15} />
          Re-embed all
        </Button>
      )}
      <AddEntrySplitButton onAdd={() => setAdding(true)} onImport={() => setImportOpen(true)} />
    </div>
  );

  return (
    <>
      <KnowledgeHeader action={actions} />

      <div className="mt-6 space-y-4">
        {/* Banner states, in priority order:
            1. re-embed job running → progress bar
            2. no embedding provider → can't make anything searchable
            3. provider active but N entries unembedded → offer re-embed */}
        {job && job.state === 'running' ? (
          <div className="rounded-xl border border-line bg-panel p-3">
            <JobProgress
              job={job}
              label="Embedding knowledge base"
              onCancel={() => qc.invalidateQueries({ queryKey: ['knowledge'] })}
            />
          </div>
        ) : status.isSuccess && !embeddingAppActive ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Embedding provider not connected.</p>
              <p className="text-xs opacity-90">
                {isAdmin ? (
                  <>
                    Entries you add are saved but won't be searchable by the AI until you connect an
                    embedding provider in{' '}
                    <a href="/apps" className="underline">
                      Apps
                    </a>
                    .
                  </>
                ) : (
                  "Entries you add are saved but won't be searchable until an admin connects an embedding provider."
                )}
              </p>
            </div>
          </div>
        ) : missingCount > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3 text-sm text-amber-700 dark:text-amber-300">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p>
                <span className="font-medium">
                  {missingCount} {missingCount === 1 ? 'entry isn’t' : 'entries aren’t'} searchable
                  yet.
                </span>{' '}
                <span className="opacity-90">Embed them so the AI can use them.</span>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => startReembed('missing')}
              disabled={reembed.isPending}
            >
              {reembed.isPending ? 'Starting…' : 'Re-embed'}
            </Button>
          </div>
        ) : null}

        <Toolbar
          filters={
            topics.length > 0 && (
              <Select value={topicFilter} onValueChange={setTopicFilter}>
                <SelectItem value={ALL_TOPICS}>All topics</SelectItem>
                {topics.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </Select>
            )
          }
          search={
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search question, answer, or topic…"
              className="w-full sm:w-72"
            />
          }
        />

        <div>
          {isError ? (
            <EmptyState>Couldn't load entries.</EmptyState>
          ) : isLoading ? (
            <Loading />
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
            <>
              <div className="overflow-hidden rounded-xl border border-line bg-panel">
                <ul className="divide-y divide-line">
                  {paged.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} onEdit={() => setEditing(entry)} />
                  ))}
                </ul>
              </div>
              <Pagination
                page={safePage}
                pageSize={pageSize}
                total={filtered.length}
                onPage={setPage}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageSize={setPageSize}
              />
            </>
          )}
        </div>
      </div>

      <EntryDialog open={adding} onOpenChange={setAdding} topics={topics} />
      <EntryDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        topics={topics}
        existing={editing}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}

function EntryRow({ entry, onEdit }: { entry: KnowledgeEntry; onEdit: () => void }) {
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
          <p className="truncate text-sm font-medium text-ink" dir="auto" title={entry.question}>
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

  const [form, setForm] = useState<EntryInput>({ question: '', answer: '', topic: null });

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

          <Field label="Topic" optional hint="Optional. Pick an existing topic or type a new one.">
            <SearchableSelect
              value={form.topic ?? ''}
              onValueChange={(v) => set('topic', v || null)}
              options={topics.map((t) => ({ value: t, label: t }))}
              placeholder="No topic"
              searchPlaceholder="Search or create a topic…"
              creatable
              clearable
              clearLabel="No topic"
            />
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
