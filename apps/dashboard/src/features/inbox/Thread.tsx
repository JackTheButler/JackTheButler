import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bot, User, BookOpen, ChevronRight, ChevronLeft, ChevronDown, Languages } from 'lucide-react';
import type { ConversationDetail, KnowledgeHitDTO, MessageDTO } from '@janetheoperator/shared';
import { MarkdownBody } from '@janetheoperator/widget-ui';
import { useIsWide } from '@/lib/useMediaQuery';
import { Button, cn } from '@/components/ui';
import { useBusiness } from '@/features/settings/useBusiness';
import { ChannelIcon, channelLabel } from './channel';
import { Composer } from './Composer';
import { relativeTime, customerLabel } from './format';
import { useAssistantTyping } from './useConversations';

/** BCP-47 → readable language name. Falls back to the raw code when
 *  unknown — the toggle label still reads sensibly. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fa: 'Persian',
  ar: 'Arabic',
  es: 'Spanish',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  hi: 'Hindi',
  bn: 'Bengali',
  tr: 'Turkish',
  vi: 'Vietnamese',
  nl: 'Dutch',
  pl: 'Polish',
  uk: 'Ukrainian',
  he: 'Hebrew',
  th: 'Thai',
  id: 'Indonesian',
  sv: 'Swedish',
  cs: 'Czech',
  el: 'Greek',
  ro: 'Romanian',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  hu: 'Hungarian',
  ur: 'Urdu',
  sw: 'Swahili',
  fil: 'Filipino',
};

function languageName(code: string | null | undefined): string {
  if (!code) return '';
  return LANGUAGE_NAMES[code] ?? code;
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function Bubble({
  msg,
  defaultLang,
  conversationLanguage,
  onShowKnowledge,
}: {
  msg: MessageDTO;
  defaultLang: string;
  conversationLanguage: string | null;
  onShowKnowledge?: (hits: KnowledgeHitDTO[]) => void;
}) {
  // Per-bubble disclosure: the default-language version is always visible;
  // clicking "Show original" reveals the original underneath in the same
  // bubble (separated by a thin rule). Clicking again hides it.
  const [showOriginal, setShowOriginal] = useState(false);

  if (msg.event || msg.author === 'system') {
    return <Divider label={msg.event ?? 'system'} />;
  }

  // A translation exists whenever the row carries a distinct `translation`
  // field. Works for both directions:
  //   - customer row: content=their lang, translation=default lang → reveal
  //     surfaces the customer's original words.
  //   - ai/agent row: content=default lang, translation=customer lang →
  //     reveal surfaces what the customer actually received.
  const hasTranslation =
    typeof msg.translation === 'string' &&
    msg.translation.length > 0 &&
    msg.translation !== msg.content;

  const defaultText = msg.author === 'customer' ? (msg.translation ?? msg.content) : msg.content;
  // What the toggle reveals depends on direction:
  //   - customer row: `content` is the customer's original words (language
  //     stored on the message itself).
  //   - ai/agent row: `translation` is what the customer actually saw —
  //     in the *customer's* language, which lives on the conversation
  //     row (msg.language is the default language, not what we want here).
  const originalText = msg.author === 'customer' ? msg.content : (msg.translation ?? '');
  const originalLang =
    msg.author === 'customer' ? msg.language : conversationLanguage;
  // ai/agent bubbles label the disclosed text as "delivered" (the customer-
  // language version), not "original" (their typed text is already shown).
  const disclosureLabel: 'original' | 'delivered' =
    msg.author === 'customer' ? 'original' : 'delivered';

  // dir="auto" lets the browser pick LTR vs RTL per-block based on script —
  // invisible for English, correct for Farsi / Arabic / Hebrew.
  const dir = 'auto' as const;

  const isAi = msg.author === 'ai';
  const isCustomer = msg.author === 'customer';
  const toneClass = isCustomer
    ? 'bg-surface ring-1 ring-line text-ink rounded-tl-sm'
    : isAi
      ? 'bg-accent text-on-accent rounded-tr-sm'
      : 'bg-staff text-white rounded-tr-sm';
  const muteClass = isCustomer ? 'text-muted' : 'opacity-70';

  return (
    <div className={cn('flex', isCustomer ? 'justify-start' : 'justify-end')}>
      <div className={cn('max-w-[min(95%,600px)] rounded-xl px-3.5 py-2.5 text-sm', toneClass)}>
        {!isCustomer && (
          <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide opacity-80">
            <span className="flex items-center gap-1">
              {isAi ? <Bot size={11} /> : <User size={11} />} {isAi ? 'Jane AI' : 'You'}
            </span>
            {/* Retrieval transparency: open the entries this reply was grounded in. */}
            {isAi && msg.knowledgeHits && msg.knowledgeHits.length > 0 && onShowKnowledge && (
              <button
                type="button"
                onClick={() => onShowKnowledge(msg.knowledgeHits!)}
                className="inline-flex items-center gap-1 rounded opacity-90 transition-opacity hover:opacity-100"
                aria-label={`Knowledge used: ${msg.knowledgeHits.length} ${msg.knowledgeHits.length === 1 ? 'entry' : 'entries'}`}
                title="Knowledge used"
              >
                <BookOpen size={11} />
                {msg.knowledgeHits.length}
              </button>
            )}
          </div>
        )}

        {/* Default-language text — always visible. */}
        <div dir={dir}>
          {isAi ? <MarkdownBody>{defaultText}</MarkdownBody> : defaultText}
        </div>

        {/* Disclosed original (or delivered) text — appears between the
            default text and the meta row when the toggle is active. */}
        {showOriginal && hasTranslation && (
          <div className="mt-2" dir={dir}>
            {isAi ? <MarkdownBody>{originalText}</MarkdownBody> : originalText}
          </div>
        )}

        {/* Meta row: toggle (if any) on the left, timestamp on the right.
            One line — saves a row of vertical space vs stacking them. */}
        <div className={cn('mt-1 flex items-center justify-between gap-3 text-[10px]', muteClass)}>
          {hasTranslation ? (
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <Languages size={11} />
              {showOriginal
                ? `Hide ${disclosureLabel}`
                : `Show ${disclosureLabel} (${languageName(originalLang) || originalLang})`}
            </button>
          ) : (
            <span />
          )}
          <span>{relativeTime(msg.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

/** "Jane AI is composing" indicator — mirrors the AI bubble (right side,
 *  accent) with bouncing dots. Shown while the pipeline runs. */
function TypingBubble() {
  return (
    <div className="flex justify-end">
      <div className="rounded-xl rounded-tr-sm bg-accent px-3.5 py-2.5 text-on-accent">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
          <Bot size={11} /> Jane AI
        </div>
        <div className="flex items-center gap-1 py-0.5">
          {[0, 150, 300].map((d) => (
            <span
              key={d}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-70"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Thread({
  convo,
  mobileActive = false,
  onBack,
  onOpenProfile,
  onTakeover,
  onHandback,
  onReply,
  onTyping,
  onReopen,
  onClose,
  onShowKnowledge,
}: {
  convo: ConversationDetail;
  mobileActive?: boolean;
  onBack?: () => void;
  onOpenProfile?: () => void;
  onTakeover: () => void;
  onHandback: () => void;
  onReply: (text: string) => void;
  onTyping?: () => void;
  onReopen: () => void;
  onClose: () => void;
  onShowKnowledge?: (hits: KnowledgeHitDTO[]) => void;
}) {
  const isWide = useIsWide();
  const human = convo.mode === 'human';
  const aiTyping = useAssistantTyping(convo.id);
  const name = customerLabel(convo.customer?.name);
  // Business default language drives which side of a bilingual bubble the
  // dashboard shows by default. Falls back to 'en' before the query lands.
  const business = useBusiness();
  const defaultLang = business.data?.defaultLanguage ?? 'en';

  // Same scroll model as the widget — stay pinned to the newest message
  // unless the operator is reading history, in which case the floating
  // "jump to latest" button appears.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prevConvoId = useRef(convo.id);
  const [showJumpDown, setShowJumpDown] = useState(false);
  const lastMessageId =
    convo.messages.length > 0 ? convo.messages[convo.messages.length - 1].id : '';

  const onMessagesScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const scrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > 24;
    setShowJumpDown(scrolledUp);
  };

  const scrollToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowJumpDown(false);
  };

  // Snap on conversation switch + on new messages (only when not currently
  // scrolled up — don't yank the operator out of history). useLayoutEffect
  // avoids a one-frame flash where the panel paints at the top first.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const switched = prevConvoId.current !== convo.id;
    prevConvoId.current = convo.id;
    if (switched) {
      el.scrollTop = el.scrollHeight;
      setShowJumpDown(false);
      return;
    }
    if (!showJumpDown) {
      el.scrollTop = el.scrollHeight;
    }
  }, [convo.id, showJumpDown, lastMessageId, convo.messages.length, aiTyping]);

  // Re-snap on the next paint to catch markdown bubbles that lay out
  // after the synchronous layout pass — long AI replies otherwise land
  // mid-message.
  useEffect(() => {
    if (showJumpDown) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [showJumpDown, lastMessageId, convo.messages.length, aiTyping]);

  return (
    <section
      className={cn(
        'fixed inset-0 z-40 flex min-w-0 flex-col bg-panel transition-transform duration-300 ease-out md:static md:inset-auto md:z-auto md:flex-1 md:translate-x-0 md:transition-none',
        mobileActive
          ? 'translate-x-0'
          : 'pointer-events-none translate-x-full md:pointer-events-auto',
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-3 md:px-5">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to conversations"
          className="md:hidden"
        >
          <ChevronLeft size={20} />
        </Button>
        {isWide ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
              <ChannelIcon channel={convo.channel} />
              <span className="truncate">
                {channelLabel(convo.channel)} · #{convo.ref}
              </span>
            </span>
          </div>
        ) : (
          <button
            onClick={onOpenProfile}
            title="Show customer details"
            className="group -mx-2 flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{name}</span>
              <span className="flex min-w-0 items-center gap-1 text-xs font-normal text-muted">
                <ChannelIcon channel={convo.channel} />
                <span className="truncate">
                  {channelLabel(convo.channel)} · #{convo.ref}
                </span>
              </span>
            </span>
            <ChevronRight
              size={14}
              className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>
        )}
        {convo.status === 'open' && (
          <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={onClose}>
            Resolve
          </Button>
        )}
      </header>

      {/* `min-h-0` is the flexbox idiom that lets the inner scroller actually
          clip + scroll instead of growing the wrapper to fit all messages. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={onMessagesScroll}
          className={cn(
            'flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 md:px-5 md:py-5',
            human && 'bg-staff-soft/40',
          )}
        >
          {convo.messages.map((m) => (
            <Bubble
              key={m.id}
              msg={m}
              defaultLang={defaultLang}
              conversationLanguage={convo.language}
              onShowKnowledge={onShowKnowledge}
            />
          ))}
          {aiTyping && <TypingBubble />}
        </div>

        {showJumpDown && (
          <button
            type="button"
            onClick={scrollToLatest}
            aria-label="Scroll to latest message"
            className="absolute bottom-3 left-1/2 z-10 inline-flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-panel text-ink shadow-lg ring-1 ring-black/5 transition-opacity hover:bg-surface"
          >
            <ChevronDown size={16} />
          </button>
        )}
      </div>

      <footer className="border-t border-line px-3 py-3 md:px-5 md:py-4">
        {convo.status === 'closed' ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
            <span className="text-muted">This conversation is resolved.</span>
            <Button size="sm" onClick={onReopen}>
              Reopen
            </Button>
          </div>
        ) : (
          <Composer
            human={human}
            onTakeOver={onTakeover}
            onHandBack={onHandback}
            onSend={onReply}
            onTyping={onTyping}
            translateHint={
              convo.language && convo.language !== defaultLang
                ? `Your reply will be translated to ${languageName(convo.language) || convo.language} before the customer reads it.`
                : undefined
            }
          />
        )}
      </footer>
    </section>
  );
}
