import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  RefreshCw,
  Ban,
  Trash2,
  Pencil,
  UploadCloud,
  Sparkles,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import { ListRow, RowMenu } from '@/components/ListRow';
import {
  Avatar,
  Badge,
  Button,
  Input,
  Select,
  SelectItem,
  Textarea,
  SearchInput,
  EmptyState,
  SegmentedControl,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  cn,
} from '@/components/ui';
import {
  sources,
  qaEntries,
  sourceMeta,
  sourceFilters,
  sourceInFilter,
  showSources,
  showQa,
  type KnowledgeSource,
  type QaEntry,
  type SourceFilter,
  type SourceStatus,
} from '@/mock/knowledge';

const STATUS: Record<
  SourceStatus,
  { label: string; tone: 'accent' | 'muted'; extra?: string }
> = {
  ready: { label: 'Ready', tone: 'accent' },
  indexing: { label: 'Indexing…', tone: 'muted' },
  queued: { label: 'Queued', tone: 'muted' },
  failed: { label: 'Failed', tone: 'muted', extra: 'text-red-600' },
  disabled: { label: 'Disabled', tone: 'muted' },
};

function StatusPill({ status }: { status: SourceStatus }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} className={cn('hidden shrink-0 sm:inline-flex', s.extra)}>
      {s.label}
    </Badge>
  );
}

function SourceRow({ source }: { source: KnowledgeSource }) {
  const { icon: Icon, label } = sourceMeta[source.type];
  const disabled = source.status === 'disabled';
  return (
    <ListRow
      disabled={disabled}
      leading={<Avatar size="sm" shape="square" icon={<Icon size={16} className="text-ink" />} />}
      status={<StatusPill status={source.status} />}
      trailing={
        <RowMenu>
          <DropdownMenuItem>
            <RefreshCw size={14} /> Re-index
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Ban size={14} /> {disabled ? 'Enable' : 'Disable'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive>
            <Trash2 size={14} /> Delete
          </DropdownMenuItem>
        </RowMenu>
      }
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">{source.title}</span>
        <Badge tone="muted" className="shrink-0 normal-case">
          {source.origin}
        </Badge>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">
        {label} · {source.entries} indexed · updated {source.updated}
      </p>
    </ListRow>
  );
}

function QaRow({ entry }: { entry: QaEntry }) {
  const Icon = sourceMeta.qa.icon;
  const disabled = entry.status === 'disabled';
  return (
    <ListRow
      disabled={disabled}
      leading={<Avatar size="sm" shape="square" icon={<Icon size={16} className="text-ink" />} />}
      status={<StatusPill status={entry.status} />}
      trailing={
        <RowMenu>
          <DropdownMenuItem>
            <Pencil size={14} /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Ban size={14} /> {disabled ? 'Enable' : 'Disable'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive>
            <Trash2 size={14} /> Delete
          </DropdownMenuItem>
        </RowMenu>
      }
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">{entry.question}</span>
        <Badge tone="muted" className="shrink-0 normal-case">
          Q&amp;A
        </Badge>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">{entry.answer}</p>
    </ListRow>
  );
}

function AddKnowledge() {
  const [tab, setTab] = useState<'Manual Q&A' | 'Upload' | 'Crawl'>('Manual Q&A');
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus size={15} /> Add knowledge
        </Button>
      </DialogTrigger>
      <DialogContent title="Add knowledge" description="Add a source the assistant can answer from.">
        <SegmentedControl
          aria-label="Source type"
          options={['Manual Q&A', 'Upload', 'Crawl'] as const}
          value={tab}
          onChange={setTab}
        />

        <div className="mt-4 space-y-3">
          {tab === 'Manual Q&A' && (
            <>
              <Input placeholder="Question — e.g. How do I reset my password?" />
              <Textarea rows={4} placeholder="Answer the assistant should give…" />
            </>
          )}

          {tab === 'Upload' && (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface px-4 py-10 text-center">
              <UploadCloud size={22} className="text-muted" />
              <span className="text-sm font-medium">Drop files or click to upload</span>
              <span className="text-xs text-muted">PDF or Markdown, up to 20 MB each</span>
              <input type="file" accept=".pdf,.md" multiple className="hidden" />
            </label>
          )}

          {tab === 'Crawl' && (
            <>
              <Input placeholder="https://example.com/help" />
              <Select defaultValue="page">
                <SelectItem value="page">This page only</SelectItem>
                <SelectItem value="section">This section (same path)</SelectItem>
                <SelectItem value="domain">Whole domain</SelectItem>
              </Select>
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="md">
              Cancel
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button size="md">
              {tab === 'Crawl' ? 'Start crawl' : tab === 'Upload' ? 'Upload' : 'Add'}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}


type Hit = { title: string; kind: keyof typeof sourceMeta; score: number; excerpt: string };
type TestResult = { answer: string | null; hits: Hit[] };

/** Mock retrieval over the fixtures — no backend. Naive term overlap so the
 *  result reacts to the query and feels real for the design. */
function mockSearch(query: string): TestResult {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const score = (text: string) =>
    terms.reduce((n, t) => (text.toLowerCase().includes(t) ? n + 1 : n), 0);

  const qa = qaEntries
    .filter((e) => e.status !== 'disabled')
    .map((e) => ({ title: e.question, answer: e.answer, kind: 'qa' as const, s: score(`${e.question} ${e.answer}`) }));
  const src = sources
    .filter((s) => s.status === 'ready')
    .map((s) => ({ title: s.title, answer: null, kind: s.type, s: score(`${s.title} ${s.origin}`) }));

  const ranked = [...qa, ...src].filter((h) => h.s > 0).sort((a, b) => b.s - a.s);
  const hits: Hit[] = ranked.slice(0, 3).map((h, i) => ({
    title: h.title,
    kind: h.kind,
    score: Math.max(0.61, 0.94 - i * 0.13),
    excerpt:
      h.answer ??
      `Retrieved passage from “${h.title}”: …the relevant section of this source that the assistant would quote to answer the question…`,
  }));

  const topQa = ranked.find((h) => h.answer);
  const answer = hits.length
    ? topQa?.answer ?? `Based on “${hits[0].title}”, the assistant would answer using that source.`
    : null;
  return { answer, hits };
}

type Phase = 'idle' | 'retrieving' | 'generating' | 'done';

function TestQuery() {
  const [q, setQ] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const runId = useRef(0);

  useEffect(() => () => void runId.current++, []); // invalidate pending steps on unmount

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) {
      setResult(null);
      setPhase('idle');
      return;
    }
    const id = ++runId.current;
    setResult(mockSearch(query));
    setPhase('retrieving'); // 1. searching
    setTimeout(() => runId.current === id && setPhase('generating'), 700); // 2. hits in, generating
    setTimeout(() => runId.current === id && setPhase('done'), 1700); // 3. answer in
  };

  const busy = phase === 'retrieving' || phase === 'generating';
  const showHits = result && result.hits.length > 0 && (phase === 'generating' || phase === 'done');

  return (
    <section className="mt-6 rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-accent" />
        <h2 className="text-sm font-semibold">Ask a question</h2>
      </div>

      <form onSubmit={ask} className="mt-3 flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask a question a customer might ask…"
        />
        <Button type="submit" size="md" className="w-20 shrink-0" disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : 'Ask'}
        </Button>
      </form>

      {phase !== 'idle' && (
        <div className="mt-6 space-y-6">
          {/* AI message — always first; cycles through progress, then the answer */}
          <div className="flex gap-2 text-sm">
            <Sparkles
              size={15}
              className={cn('mt-0.5 shrink-0 text-accent', busy && 'animate-pulse')}
            />
            {phase === 'retrieving' && <span className="text-muted">Searching knowledge…</span>}
            {phase === 'generating' && (
              <span className="inline-flex items-center gap-2 text-muted">
                <Loader2 size={14} className="animate-spin text-accent" /> Generating answer…
              </span>
            )}
            {phase === 'done' &&
              (result?.answer ? (
                <p className="animate-[rise-in_240ms_ease-out_both]">{result.answer}</p>
              ) : (
                <p className="animate-[rise-in_240ms_ease-out_both] text-muted">
                  No relevant knowledge found — the assistant would say it doesn’t know (or
                  escalate).
                </p>
              ))}
          </div>

          {/* Retrieved knowledge — below the message; click to expand */}
          {showHits && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Knowledge used
              </h3>
              <div className="flex flex-col gap-1.5">
                {result!.hits.map((h, i) => {
                  const Icon = sourceMeta[h.kind].icon;
                  return (
                    <div
                      key={h.title}
                      style={{ animationDelay: `${i * 70}ms` }}
                      className="animate-[rise-in_220ms_ease-out_both]"
                    >
                      <Collapsible className="overflow-hidden rounded-lg bg-surface ring-1 ring-line">
                        <CollapsibleTrigger className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors hover:bg-line/40">
                          <Icon size={13} className="shrink-0 text-muted" />
                          <span className="flex-1 truncate">{h.title}</span>
                          <span className="shrink-0 font-mono text-[10px] text-accent">
                            {h.score.toFixed(2)}
                          </span>
                          <ChevronDown
                            size={13}
                            className="shrink-0 text-muted transition-transform group-data-[state=open]:rotate-180"
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <p className="px-2.5 pb-2 text-xs text-muted">{h.excerpt}</p>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function KnowledgeBasePage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SourceFilter>('All');

  const { qa, srcs } = useMemo(() => {
    const q = query.trim().toLowerCase();
    return {
      qa: showQa(filter)
        ? qaEntries.filter(
            (e) =>
              !q ||
              e.question.toLowerCase().includes(q) ||
              e.answer.toLowerCase().includes(q),
          )
        : [],
      srcs: showSources(filter)
        ? sources.filter(
            (s) =>
              sourceInFilter(s, filter) &&
              (!q ||
                s.title.toLowerCase().includes(q) ||
                s.origin.toLowerCase().includes(q)),
          )
        : [],
    };
  }, [query, filter]);

  const empty = qa.length === 0 && srcs.length === 0;

  return (
    <PageShell>
      <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
        <PageHeader
          title="Knowledge Base"
          subtitle={`${qaEntries.length} Q&A pairs · ${sources.length} sources`}
          action={<AddKnowledge />}
        />

        <TestQuery />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            aria-label="Filter knowledge"
            options={sourceFilters}
            value={filter}
            onChange={setFilter}
            className="-mx-4 px-4 md:mx-0 md:px-0"
          />
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search knowledge…"
            className="w-full sm:w-56"
          />
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-panel">
          {empty ? (
            <EmptyState>Nothing here yet.</EmptyState>
          ) : (
            <>
              {qa.map((e) => (
                <QaRow key={e.id} entry={e} />
              ))}
              {srcs.map((s) => (
                <SourceRow key={s.id} source={s} />
              ))}
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
