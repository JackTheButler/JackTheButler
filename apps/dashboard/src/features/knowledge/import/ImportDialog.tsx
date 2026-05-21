import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  Select,
  SelectItem,
  Switch,
  toast,
} from '@/components/ui';
import { useJob } from '@/lib/useJob';
import { parseSpreadsheet, UnsupportedFileError, type Grid } from './parseFile';
import { detectColumns, mapRows, type ColumnMap } from './columns';
import { checkDuplicates, bulkImport, useReembed, type CheckResult } from '../useKnowledge';

type Phase = 'select' | 'review' | 'importing' | 'embedding' | 'done';
type Status = 'new' | 'exists' | 'similar';

const PREVIEW_LIMIT = 100; // rows rendered in the preview; all valid rows still import

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const reembed = useReembed();

  const [phase, setPhase] = useState<Phase>('select');
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const [fileName, setFileName] = useState('');
  const [grid, setGrid] = useState<Grid | null>(null);
  const [map, setMap] = useState<ColumnMap>({ question: -1, answer: -1, topic: -1 });
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [skipSimilar, setSkipSimilar] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [inserted, setInserted] = useState(0);

  const headers = grid?.[0] ?? [];
  const { pairs, invalid } = useMemo(
    () => (grid ? mapRows(grid, map) : { pairs: [], invalid: 0 }),
    [grid, map],
  );

  // Reset everything when the dialog closes so a re-open starts clean.
  useEffect(() => {
    if (open) return;
    setPhase('select');
    setFileName('');
    setGrid(null);
    setMap({ question: -1, answer: -1, topic: -1 });
    setError(null);
    setCheck(null);
    setSkipSimilar(false);
    setProgress({ processed: 0, total: 0 });
    setInserted(0);
    setJobId(null);
  }, [open]);

  // Step 2 finished (or failed): the embed job left 'running' → show Done.
  useEffect(() => {
    if (phase === 'embedding' && job && job.state !== 'running') {
      qc.invalidateQueries({ queryKey: ['knowledge'] });
      setPhase('done');
    }
  }, [phase, job, qc]);

  // Duplicate-check whenever the mapped questions change (re-maps re-check).
  useEffect(() => {
    if (phase !== 'review' || map.question < 0 || pairs.length === 0) {
      setCheck(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    checkDuplicates(pairs.map((p) => p.question))
      .then((r) => !cancelled && setCheck(r))
      .catch(() => !cancelled && setCheck(null))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [phase, pairs, map.question]);

  async function handleFile(file: File) {
    setError(null);
    setParsing(true);
    try {
      const g = await parseSpreadsheet(file);
      if (g.length < 2) {
        setError('No data rows found below the header.');
        return;
      }
      setGrid(g);
      setFileName(file.name);
      setMap(detectColumns(g[0]));
      setPhase('review');
    } catch (e) {
      setError(e instanceof UnsupportedFileError ? e.message : 'Could not read this file.');
    } finally {
      setParsing(false);
    }
  }

  const statuses = useMemo<Status[]>(
    () =>
      pairs.map((_, i) => {
        const c = check?.results[i];
        if (!c) return 'new';
        if (c.exists) return 'exists';
        if (c.similar) return 'similar';
        return 'new';
      }),
    [pairs, check],
  );

  const counts = useMemo(() => {
    let exists = 0;
    let similar = 0;
    let fresh = 0;
    for (const s of statuses) {
      if (s === 'exists') exists++;
      else if (s === 'similar') similar++;
      else fresh++;
    }
    return { exists, similar, fresh };
  }, [statuses]);

  const importable = useMemo(
    () =>
      pairs.filter((_, i) => statuses[i] === 'new' || (statuses[i] === 'similar' && !skipSimilar)),
    [pairs, statuses, skipSimilar],
  );

  const mappingReady = map.question >= 0 && map.answer >= 0 && pairs.length > 0;

  // Embedding happens server-side (the API key isn't in the browser), so after
  // inserting we trigger the re-embed-missing job and watch its progress.
  const canEmbed = check?.mode === 'semantic';

  async function runImport() {
    setProgress({ processed: 0, total: importable.length });
    setPhase('importing');
    try {
      const r = await bulkImport(importable, (processed, total) =>
        setProgress({ processed, total }),
      );
      setInserted(r.inserted);
      qc.invalidateQueries({ queryKey: ['knowledge'] });

      if (canEmbed && r.inserted > 0) {
        // Step 2: make the new (and any other unembedded) rows searchable.
        const j = await reembed.mutateAsync('missing');
        setJobId(j.id);
        setPhase('embedding');
      } else {
        setPhase('done');
      }
    } catch {
      toast.error('Import failed — you can retry; already-added entries are skipped.');
      setPhase('review');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullScreen
        title="Import knowledge"
        description="Add many Q&A entries at once from a spreadsheet."
        footer={
          <Footer
            phase={phase}
            counts={counts}
            invalid={invalid}
            importableCount={importable.length}
            progress={progress}
            embed={{ processed: job?.processed ?? 0, total: job?.total ?? 0 }}
            mappingReady={mappingReady}
            checking={checking}
            onImport={runImport}
            onClose={() => onOpenChange(false)}
          />
        }
      >
        <div className="mx-auto max-w-3xl">
          {phase === 'select' && (
            <SelectFile
              parsing={parsing}
              error={error}
              onPick={() => fileInput.current?.click()}
              onDrop={handleFile}
            />
          )}

          {(phase === 'review' || phase === 'importing') && grid && (
            <Review
              fileName={fileName}
              rowCount={grid.length - 1}
              headers={headers}
              map={map}
              setMap={setMap}
              pairs={pairs}
              statuses={statuses}
              check={check}
              checking={checking}
              counts={counts}
              skipSimilar={skipSimilar}
              setSkipSimilar={setSkipSimilar}
              disabled={phase === 'importing'}
              onChangeFile={() => setPhase('select')}
            />
          )}

          {phase === 'embedding' && (
            <Embedding processed={job?.processed ?? 0} total={job?.total ?? 0} />
          )}

          {/* `jobId` is set only when the embed step ran (and reset on close),
              so it survives `check` being cleared on the review→importing exit. */}
          {phase === 'done' && <Done inserted={inserted} embedded={jobId !== null} />}
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/* ── Phase: select file ────────────────────────────────────────── */

function SelectFile({
  parsing,
  error,
  onPick,
  onDrop,
}: {
  parsing: boolean;
  error: string | null;
  onPick: () => void;
  onDrop: (file: File) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div className="pt-6">
      <button
        type="button"
        onClick={onPick}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onDrop(f);
        }}
        className={
          'flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors ' +
          (over
            ? 'border-accent bg-accent-soft/40'
            : 'border-line hover:border-accent/40 hover:bg-surface')
        }
      >
        <Upload size={28} className="text-muted" />
        <div>
          <p className="text-sm font-medium text-ink">
            {parsing ? 'Reading file…' : 'Drop a file here, or click to browse'}
          </p>
          <p className="mt-1 text-xs text-muted">
            Excel (.xlsx) or CSV — needs Question & Answer columns.
          </p>
        </div>
      </button>
      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.04] p-3 text-xs text-red-600">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

/* ── Phase: review (map + preview) ─────────────────────────────── */

function Review({
  fileName,
  rowCount,
  headers,
  map,
  setMap,
  pairs,
  statuses,
  check,
  checking,
  counts,
  skipSimilar,
  setSkipSimilar,
  disabled,
  onChangeFile,
}: {
  fileName: string;
  rowCount: number;
  headers: string[];
  map: ColumnMap;
  setMap: (m: ColumnMap) => void;
  pairs: { question: string; answer: string; topic: string | null }[];
  statuses: Status[];
  check: CheckResult | null;
  checking: boolean;
  counts: { exists: number; similar: number; fresh: number };
  skipSimilar: boolean;
  setSkipSimilar: (v: boolean) => void;
  disabled: boolean;
  onChangeFile: () => void;
}) {
  const colSelect = (key: keyof ColumnMap, allowNone: boolean) => (
    <Select
      // -1 means "unmapped" → pass undefined so the placeholder shows, keeping
      // all three pickers consistent when a column isn't auto-detected. (Topic
      // still offers an explicit "None" item to clear a detected column.)
      value={map[key] >= 0 ? String(map[key]) : undefined}
      onValueChange={(v) => setMap({ ...map, [key]: Number(v) })}
      placeholder="Select a column…"
    >
      {allowNone && <SelectItem value="-1">None</SelectItem>}
      {headers.map((h, i) => (
        <SelectItem key={i} value={String(i)}>
          {h.trim() || `Column ${i + 1}`}
        </SelectItem>
      ))}
    </Select>
  );

  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
      <div className="flex items-center justify-between gap-3 py-1">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <FileSpreadsheet size={16} className="shrink-0 text-muted" />
          <span className="truncate font-medium">{fileName}</span>
          <span className="shrink-0 text-muted">· {rowCount} rows</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onChangeFile}>
          Change file
        </Button>
      </div>

      {check?.mode === 'exact' && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-3 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>
            No embedding provider connected — duplicate detection is limited to exact text matches.
            Connect one in{' '}
            <a href="/apps" className="underline">
              Apps
            </a>{' '}
            to catch reworded duplicates.
          </span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Labeled label="Question column">{colSelect('question', false)}</Labeled>
        <Labeled label="Answer column">{colSelect('answer', false)}</Labeled>
        <Labeled label="Topic column (optional)">{colSelect('topic', true)}</Labeled>
      </div>

      {counts.similar > 0 && (
        <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-line bg-panel px-3 py-2.5">
          <span className="text-sm">
            Skip {counts.similar} likely duplicate{counts.similar === 1 ? '' : 's'} (semantic
            matches)
          </span>
          <Switch
            checked={skipSimilar}
            onCheckedChange={setSkipSimilar}
            aria-label="Skip likely duplicates"
          />
        </label>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface text-xs text-muted">
            <tr>
              <th className="w-28 px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Question</th>
              <th className="px-3 py-2 font-medium">Answer</th>
              <th className="w-32 px-3 py-2 font-medium">Topic</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pairs.slice(0, PREVIEW_LIMIT).map((p, i) => {
              const s = statuses[i];
              return (
                <tr key={i} className={s === 'exists' ? 'text-muted' : ''}>
                  <td className="px-3 py-2 align-top">
                    <StatusBadge status={s} score={check?.results[i]?.similar?.score} />
                  </td>
                  <td className="max-w-0 truncate px-3 py-2 align-top">{p.question}</td>
                  <td className="max-w-0 truncate px-3 py-2 align-top text-muted">{p.answer}</td>
                  <td className="truncate px-3 py-2 align-top text-muted">{p.topic ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pairs.length > PREVIEW_LIMIT && (
          <div className="border-t border-line px-3 py-2 text-center text-xs text-muted">
            + {pairs.length - PREVIEW_LIMIT} more rows (all valid rows import)
          </div>
        )}
        {pairs.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted">
            {map.question < 0 || map.answer < 0
              ? 'Map the Question and Answer columns to preview.'
              : 'No valid rows — every row is missing a question or answer.'}
          </div>
        )}
      </div>

      {checking && <p className="mt-2 text-xs text-muted">Checking for duplicates…</p>}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status, score }: { status: Status; score?: number }) {
  if (status === 'exists') return <Badge tone="muted">Exists</Badge>;
  if (status === 'similar')
    return <Badge tone="staff">Similar{score ? ` ${score.toFixed(2)}` : ''}</Badge>;
  return <Badge tone="accent">New</Badge>;
}

/* ── Phase: embedding (step 2) ─────────────────────────────────── */

function Embedding({ processed, total }: { processed: number; total: number }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Loader2 size={32} className="animate-spin text-accent" />
      <div>
        <p className="text-sm font-medium text-ink">Making entries searchable…</p>
        <p className="mt-1 text-xs text-muted">
          Embedding {processed} / {total}
        </p>
      </div>
    </div>
  );
}

/* ── Phase: done ───────────────────────────────────────────────── */

function Done({ inserted, embedded }: { inserted: number; embedded: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <CheckCircle2 size={36} className="text-accent" />
      <div>
        <p className="text-sm font-medium text-ink">
          Imported {inserted} {inserted === 1 ? 'entry' : 'entries'}
        </p>
        <p className="mt-1 text-xs text-muted">
          {embedded
            ? 'Embedded and searchable now.'
            : 'Not searchable until embedded — connect an embedding provider, then use “Re-embed”.'}
        </p>
      </div>
    </div>
  );
}

/* ── Pinned footer ─────────────────────────────────────────────── */

function Footer({
  phase,
  counts,
  invalid,
  importableCount,
  progress,
  embed,
  mappingReady,
  checking,
  onImport,
  onClose,
}: {
  phase: Phase;
  counts: { exists: number; similar: number; fresh: number };
  invalid: number;
  importableCount: number;
  progress: { processed: number; total: number };
  embed: { processed: number; total: number };
  mappingReady: boolean;
  checking: boolean;
  onImport: () => void;
  onClose: () => void;
}) {
  if (phase === 'select') {
    return (
      <div className="flex justify-end">
        <Button variant="ghost" size="md" onClick={onClose}>
          Cancel
        </Button>
      </div>
    );
  }

  if (phase === 'importing' || phase === 'embedding') {
    const bar = phase === 'importing' ? progress : embed;
    const label = phase === 'importing' ? 'Importing' : 'Embedding';
    const pct = bar.total ? Math.round((bar.processed / bar.total) * 100) : 0;
    return (
      <div className="flex items-center gap-4">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-xs text-muted">
          {label} {bar.processed} / {bar.total}
        </span>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="flex justify-end">
        <Button size="md" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  // review
  const summary = [
    `${counts.fresh} new`,
    counts.similar > 0 && `${counts.similar} similar`,
    counts.exists > 0 && `${counts.exists} already exist`,
    invalid > 0 && `${invalid} invalid`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate text-xs text-muted">
        {mappingReady ? summary : 'Map Question & Answer columns'}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="md" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="md"
          onClick={onImport}
          disabled={!mappingReady || checking || importableCount === 0}
        >
          Import {importableCount > 0 ? importableCount : ''}{' '}
          {importableCount === 1 ? 'entry' : 'entries'}
        </Button>
      </div>
    </div>
  );
}
