import { useState, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useActivityFeed, type ActivityEventType, type ActivityItem } from '@/hooks/useActivityFeed';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DOT_CLASS: Record<ActivityEventType, string> = {
  ai_reply:     'bg-violet-500',
  ai_resolved:  'bg-blue-500',
  task_created: 'bg-amber-400',
  checkin:      'bg-emerald-500',
  escalated:    'bg-red-500',
  checkout:     'bg-slate-400',
};

const FILTER_TYPES: ActivityEventType[] = [
  'ai_reply', 'ai_resolved', 'task_created', 'checkin', 'checkout', 'escalated',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActivityTicker() {
  const { t } = useTranslation('dashboard');
  const { items, isLoading } = useActivityFeed();
  const [, tick] = useState(0);
  const [enabled, setEnabled] = useState<Set<ActivityEventType>>(() => {
    try {
      const saved = localStorage.getItem('activity-filter');
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const valid = parsed.filter((s): s is ActivityEventType => FILTER_TYPES.includes(s as ActivityEventType));
        if (valid.length > 0) return new Set(valid);
      }
    } catch { /* ignore */ }
    return new Set(FILTER_TYPES);
  });
  const [open, setOpen] = useState(false);

  const timeAgo = (ts: number): string => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5)     return t('home.activity.time.justNow');
    if (diff < 60)    return t('home.activity.time.secondsAgo', { count: diff });
    if (diff < 3600)  return t('home.activity.time.minutesAgo', { count: Math.floor(diff / 60) });
    if (diff < 86400) return t('home.activity.time.hoursAgo',   { count: Math.floor(diff / 3600) });
    return t('home.activity.time.daysAgo', { count: Math.floor(diff / 86400) });
  };

  const buildText = (event: ActivityItem): string => {
    const d = event.data;
    if (!d) return event.text;
    switch (event.type) {
      case 'task_created':
        return t('home.activity.text.task_created', {
          taskType: t(`home.activity.taskTypes.${d.taskType ?? 'other'}`),
        });
      case 'checkin':
        return t('home.activity.text.checkin', { guestName: d.guestName });
      case 'checkout':
        return t('home.activity.text.checkout', { guestName: d.guestName });
      case 'ai_resolved':
        return t('home.activity.text.ai_resolved', { intent: d.intent ?? '' });
      case 'ai_reply':
        return t('home.activity.text.ai_reply');
      case 'escalated':
        return t('home.activity.text.escalated');
      default:
        return event.text;
    }
  };

  const knownChannels = ['whatsapp', 'email', 'sms', 'webchat'] as const;

  const buildDetail = (event: ActivityItem): string => {
    const d = event.data;
    if (!d) return event.detail;
    const ch = event.channel && knownChannels.includes(event.channel as typeof knownChannels[number])
      ? t(`home.activity.channels.${event.channel}`)
      : (event.channel ?? null);
    switch (event.type) {
      case 'task_created': {
        const parts = [
          d.roomNumber ? t('home.activity.detail.room', { number: d.roomNumber }) : null,
          d.priority ? t(`home.activity.priority.${d.priority}`) : null,
        ].filter(Boolean);
        return parts.join(' · ') || t('home.activity.detail.newTask');
      }
      case 'checkin':
      case 'checkout': {
        const parts = [
          d.roomNumber ? t('home.activity.detail.room', { number: d.roomNumber }) : null,
          d.roomType ?? null,
        ].filter(Boolean);
        return parts.join(' · ') || t('home.activity.detail.guestStay');
      }
      case 'ai_reply':
        return d.snippet ? `${ch ?? ''} · "${d.snippet}"` : event.detail;
      case 'ai_resolved':
        return ch ?? event.detail;
      case 'escalated':
        return [ch, d.intent].filter(Boolean).join(' · ') || event.detail;
      default:
        return event.detail;
    }
  };

  // Refresh relative timestamps every 5 s
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [open]);

  const updateEnabled = (next: Set<ActivityEventType>) => {
    setEnabled(next);
    try { localStorage.setItem('activity-filter', JSON.stringify([...next])); } catch { /* ignore */ }
  };

  const toggle = (type: ActivityEventType) => {
    const next = new Set(enabled);
    next.has(type) ? next.delete(type) : next.add(type);
    updateEnabled(next);
  };

  const visibleItems = items.filter((e) => enabled.has(e.type));
  const allOn = enabled.size === FILTER_TYPES.length;

  return (
    <Card className="overflow-hidden">
      <style>{`
        .ticker-row {
          display: grid;
          grid-template-rows: 1fr;
          opacity: 1;
          transition:
            grid-template-rows 0.38s cubic-bezier(0.22, 1, 0.36, 1),
            opacity            0.28s ease 0.08s;
        }
        @starting-style {
          .ticker-row {
            grid-template-rows: 0fr;
            opacity: 0;
          }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <span className="text-xs font-semibold tracking-wide text-foreground">
          {t('home.activity.title')}
        </span>

        <div className="flex items-center gap-3">
          {/* Filter dropdown */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setOpen((v) => !v)}
              className={cn(
                'flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md transition-colors',
                allOn
                  ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  : 'text-primary bg-primary/10 hover:bg-primary/15'
              )}
            >
              {allOn
                ? t('home.activity.allEvents')
                : t('home.activity.nOfTotal', { count: enabled.size, total: FILTER_TYPES.length })}
              <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-border bg-popover shadow-md py-1">
                {/* All toggle */}
                <button
                  onClick={() => updateEnabled(allOn ? new Set() : new Set(FILTER_TYPES))}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted transition-colors"
                >
                  <span>{allOn ? t('home.activity.hideAll') : t('home.activity.showAll')}</span>
                </button>
                <div className="h-px bg-border mx-2 my-1" />
                {FILTER_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => toggle(type)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] hover:bg-muted transition-colors"
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', DOT_CLASS[type])} />
                    <span className="flex-1 text-left text-foreground">
                      {t(`home.activity.filters.${type}`)}
                    </span>
                    {enabled.has(type) && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* LIVE badge */}
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              {t('home.activity.live')}
            </span>
          </div>
        </div>
      </div>

      {/* Event list */}
      <div className="h-[296px] overflow-y-auto">
        {isLoading && visibleItems.length === 0 && (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            {t('home.activity.loading')}
          </div>
        )}
        {!isLoading && visibleItems.length === 0 && (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            {t('home.activity.empty')}
          </div>
        )}
        {visibleItems.map((event) => (
          <div key={event.id} className="ticker-row">
            <div className="overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30">
                <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-px', DOT_CLASS[event.type])} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate leading-tight">{buildText(event)}</p>
                  <p className="text-xs text-muted-foreground truncate">{buildDetail(event)}</p>
                </div>
                <span className="text-[11px] text-muted-foreground flex-shrink-0 tabular-nums">
                  {timeAgo(event.ts)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
