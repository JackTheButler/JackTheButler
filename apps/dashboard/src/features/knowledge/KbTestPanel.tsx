import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, SlidersHorizontal, ArrowRight, Send, Loader2 } from 'lucide-react';
import { MarkdownBody } from '@janetheoperator/widget-ui';
import {
  Alert,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  cn,
} from '@/components/ui';
import { JaneLogo } from '@/components/JaneLogo';
import { JaneLoader } from '@/components/JaneLoader';
import { useSession } from '@/features/auth/useAuth';
import { TimingRibbon, type AskTimings } from './TimingRibbon';
import { KnowledgeHitList } from './KnowledgeHitList';

/** "Ask Jane" — test the knowledge base. Streams progress from the backend
 *  (POST /knowledge/ask, NDJSON): phase → matches → answer. Mirrors live chat. */

interface AskMatch {
  id: string;
  question: string;
  answer: string;
  topic: string | null;
  score: number;
}

type Phase =
  | 'translating_question'
  | 'embedding'
  | 'searching'
  | 'generating'
  | 'translating_answer';

type AskEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'matches'; matches: AskMatch[] }
  | { type: 'answer'; text: string }
  | { type: 'timing'; section: keyof AskTimings; ms: number }
  | { type: 'error'; reason: string }
  | { type: 'done' };

const PHASE_TEXT: Record<Phase, string> = {
  translating_question: 'Translating your question…',
  embedding: 'Embedding your question…',
  searching: 'Searching your knowledge base…',
  generating: 'Composing the answer…',
  translating_answer: 'Translating the answer…',
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
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  const [q, setQ] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [matches, setMatches] = useState<AskMatch[]>([]);
  const [searched, setSearched] = useState(false);
  const [answer, setAnswer] = useState('');
  // Accumulated per-stage timings; fills in progressively as `timing` events
  // arrive, so the ribbon grows segment-by-segment during the stream.
  const [timings, setTimings] = useState<AskTimings>({});
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    const question = q.trim();
    if (!question || streaming) return;
    setStreaming(true);
    setPhase(null);
    setMatches([]);
    setSearched(false);
    setAnswer('');
    setTimings({});
    setError(null);

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
        else if (event.type === 'matches') {
          setMatches(event.matches);
          setSearched(true);
        }
        else if (event.type === 'answer') setAnswer(event.text);
        else if (event.type === 'timing')
          setTimings((prev) => ({ ...prev, [event.section]: event.ms }));
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
    <Collapsible className="rounded-xl border border-line bg-accent-soft">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-5 text-left">
        <span className="text-sm font-semibold">Test your knowledge base</span>
        <ChevronDown
          size={16}
          className="shrink-0 text-muted transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 px-5 pb-5">
        {/* Send icon lives inside the input; it colours in once there's text,
            signalling it's ready to press. */}
        <div className="relative">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask a question the way a customer would…"
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => void ask()}
            disabled={!q.trim() || streaming}
            aria-label="Ask Jane"
            title="Ask Jane"
            className={cn(
              'absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md transition-colors',
              q.trim() && !streaming ? 'bg-accent text-on-accent hover:opacity-90' : 'text-muted/50',
            )}
          >
            {streaming ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
          </button>
        </div>

      {active && (
        // No inner card and no divider — results sit directly on the panel,
        // spaced from the input by the parent's space-y gap.
        <div className="space-y-3">
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

          {/* Per-stage timing breakdown, right under the answer. */}
          <TimingRibbon timings={timings} streaming={streaming} />

          {error && (
            <Alert variant={error === 'no_generation' ? 'info' : 'error'}>
              {ERROR_TEXT[error] ?? 'Something went wrong. Please try again.'}
            </Alert>
          )}

          {/* Retrieved entries — appear as soon as matches arrive. Shares the
              KnowledgeHitList component with the inbox transparency panel. */}
          {matches.length > 0 && (
            <div className={answer || working || error ? 'border-t border-ink/10 pt-3' : undefined}>
              <div className="mb-1.5 text-xs font-medium text-muted">
                Retrieved from {matches.length} {matches.length === 1 ? 'entry' : 'entries'}
              </div>
              <KnowledgeHitList
                hits={matches.map((m) => ({
                  id: m.id,
                  question: m.question,
                  answer: m.answer,
                  topic: m.topic,
                  similarity: m.score,
                }))}
              />
            </div>
          )}

          {/* Once a search has run (any result count), point the operator at the
              retrieval settings — strictness + how many entries Jane considers —
              so they can tune what matched here. Admin-only page, so non-admins
              get a plain note instead of a dead link. */}
          {searched && (
            <div className="flex items-start gap-2 border-t border-ink/10 pt-3 text-xs leading-relaxed text-muted">
              <SlidersHorizontal size={14} className="mt-0.5 shrink-0" />
              {isAdmin ? (
                <p>
                  Your retrieval settings control which entries match, including match strictness and
                  how many entries Jane considers.{' '}
                  <Link
                    to="/settings/knowledge"
                    className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline"
                  >
                    Adjust settings
                    <ArrowRight size={12} />
                  </Link>
                </p>
              ) : (
                <p>
                  The workspace retrieval settings control which entries match, including match
                  strictness and how many entries Jane considers. An admin can adjust them in
                  Settings.
                </p>
              )}
            </div>
          )}

        </div>
      )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
