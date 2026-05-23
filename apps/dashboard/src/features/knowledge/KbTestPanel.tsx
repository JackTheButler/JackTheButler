import { useState, type KeyboardEvent } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { MarkdownBody } from '@janetheoperator/widget-ui';
import {
  Alert,
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  cn,
} from '@/components/ui';
import { JaneLogo } from '@/components/JaneLogo';
import { JaneLoader } from '@/components/JaneLoader';

/** "Ask Jane" — test the knowledge base. Streams progress from the backend
 *  (POST /knowledge/ask, NDJSON): phase → matches → answer. Mirrors live chat. */

interface AskMatch {
  id: string;
  question: string;
  answer: string;
  topic: string | null;
  score: number;
}

type Phase = 'embedding' | 'searching' | 'generating';

type AskEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'matches'; matches: AskMatch[] }
  | { type: 'answer'; text: string }
  | { type: 'error'; reason: string }
  | { type: 'done' };

const PHASE_TEXT: Record<Phase, string> = {
  embedding: 'Embedding your question…',
  searching: 'Searching your knowledge base…',
  generating: 'Composing the answer…',
};

const ERROR_TEXT: Record<string, string> = {
  no_embedding: 'Connect an embedding provider in Apps to test the knowledge base.',
  no_generation:
    "These are the entries Jane found. Connect a generation provider to see her composed answer.",
  embedding_failed: 'Something went wrong while searching. Please try again.',
  generation_failed: 'Something went wrong while composing the answer. Please try again.',
  network: 'Connection interrupted. Please try again.',
};

export function KbTestPanel() {
  const [q, setQ] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [matches, setMatches] = useState<AskMatch[]>([]);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ask = async () => {
    const question = q.trim();
    if (!question || streaming) return;
    setStreaming(true);
    setPhase(null);
    setMatches([]);
    setAnswer('');
    setError(null);
    setExpanded(new Set());

    try {
      const res = await fetch('/api/app/knowledge/ask', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!res.ok || !res.body) {
        setError('network');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const handle = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as AskEvent;
        if (event.type === 'phase') setPhase(event.phase);
        else if (event.type === 'matches') setMatches(event.matches);
        else if (event.type === 'answer') setAnswer(event.text);
        else if (event.type === 'error') setError(event.reason);
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        lines.forEach(handle);
      }
      handle(buf);
    } catch {
      setError('network');
    } finally {
      setStreaming(false);
      setPhase(null);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') void ask();
  };

  const active = streaming || matches.length > 0 || !!answer || !!error;
  // Still working toward an answer (no answer yet, no terminal error).
  const working = streaming && !answer && error !== 'no_embedding';

  return (
    <Collapsible className="rounded-xl border border-line bg-panel">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-5 text-left">
        <span className="text-sm font-semibold">Test your knowledge base</span>
        <ChevronDown
          size={16}
          className="shrink-0 text-muted transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 px-5 pb-5">
        <div className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask a question the way a customer would…"
          />
          <Button
            size="md"
            onClick={() => void ask()}
            disabled={!q.trim() || streaming}
            className="shrink-0"
          >
            {streaming ? 'Asking…' : 'Ask Jane'}
          </Button>
        </div>

      {active && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
          {/* Answer — loader + phase while working, then Jane's reply. */}
          {(answer || working) && (
            <div className="flex gap-3">
              {answer ? (
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent text-on-accent">
                  <JaneLogo size={13} />
                </span>
              ) : (
                <span className="grid h-6 w-6 shrink-0 place-items-center">
                  <JaneLoader size={18} float={false} />
                </span>
              )}
              {answer ? (
                <div className="min-w-0 flex-1 text-sm leading-relaxed text-ink" dir="auto">
                  <MarkdownBody>{answer}</MarkdownBody>
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-muted" dir="auto">
                  {phase ? PHASE_TEXT[phase] : 'Thinking…'}
                </p>
              )}
            </div>
          )}

          {error && (
            <Alert variant={error === 'no_generation' ? 'info' : 'error'}>
              {ERROR_TEXT[error] ?? 'Something went wrong. Please try again.'}
            </Alert>
          )}

          {/* Retrieved entries — appear as soon as matches arrive. */}
          {matches.length > 0 && (
            <div className={answer || working || error ? 'border-t border-line pt-3' : undefined}>
              <div className="mb-1.5 text-xs font-medium text-muted">
                Retrieved from {matches.length} {matches.length === 1 ? 'entry' : 'entries'}
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {matches.map((m) => {
                  const open = expanded.has(m.id);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => toggle(m.id)}
                        aria-expanded={open}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-panel"
                      >
                        <ChevronRight
                          size={14}
                          className={cn(
                            'shrink-0 text-muted transition-transform',
                            open && 'rotate-90',
                          )}
                        />
                        <span className="truncate text-sm font-medium text-ink" dir="auto">
                          {m.question}
                        </span>
                        {m.topic && (
                          <Badge tone="muted" shape="tag" className="shrink-0">
                            {m.topic}
                          </Badge>
                        )}
                        <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink">
                          {Math.round(m.score * 100)}% match
                        </span>
                      </button>
                      {open && (
                        <p className="px-3 pb-3 pl-[1.625rem] text-sm text-muted" dir="auto">
                          {m.answer}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
