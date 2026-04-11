import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAnalytics } from '@/hooks/useAnalytics';
import type { RangePreset, MetricResult, SeriesPoint } from '@/hooks/useAnalytics';

// ---------------------------------------------------------------------------
// Preset selector — labels resolved at render time via t()
// ---------------------------------------------------------------------------

const PRESET_VALUES: RangePreset[] = ['today', 'yesterday', '3d', '7d', '14d', '30d'];

// ---------------------------------------------------------------------------
// Card config
// ---------------------------------------------------------------------------

type OverviewKey = 'totalMessages' | 'autonomyRate' | 'avgResponseMs' | 'activeGuests' | 'newGuests';

interface CardConfig {
  key: OverviewKey;
  label: string;
  format: (v: number) => string;
  chartType: 'area' | 'bar';
  color: string;
  gradientId: string;
  /** When true, a decrease in value is shown as positive (e.g. response time) */
  invertDelta?: boolean;
}

// Card configs without labels — labels are injected at render time via t()
const CARD_CONFIGS: Omit<CardConfig, 'label'>[] = [
  {
    key: 'totalMessages',
    format: (v) => String(v),
    chartType: 'area',
    color: 'hsl(214, 100%, 50%)',
    gradientId: 'grad-messages',
  },
  {
    key: 'autonomyRate',
    format: (v) => `${v}%`,
    chartType: 'area',
    color: 'hsl(142, 70%, 45%)',
    gradientId: 'grad-autonomy',
  },
  {
    key: 'avgResponseMs',
    format: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`,
    chartType: 'area',
    color: 'hsl(262, 70%, 55%)',
    gradientId: 'grad-response',
    invertDelta: true,
  },
  {
    key: 'activeGuests',
    format: (v) => String(v),
    chartType: 'area',
    color: 'hsl(25, 90%, 55%)',
    gradientId: 'grad-guests',
  },
  {
    key: 'newGuests',
    format: (v) => String(v),
    chartType: 'bar',
    color: 'hsl(188, 75%, 45%)',
    gradientId: 'grad-new-guests',
  },
];

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function SparkTooltip({
  active,
  payload,
  format,
}: {
  active?: boolean;
  payload?: { value: number }[];
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-md px-2 py-1 text-xs text-popover-foreground shadow-md">
      {format(payload[0].value)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline skeleton shown while loading
// ---------------------------------------------------------------------------

function SparklineSkeleton() {
  return <div className="h-10 rounded-md bg-muted/40 animate-pulse" />;
}

// ---------------------------------------------------------------------------
// Single metric item
// ---------------------------------------------------------------------------

function AnalyticItem({
  card,
  metric,
  isLoading,
}: {
  card: CardConfig;
  metric: MetricResult | undefined;
  isLoading: boolean;
}) {
  const delta = metric?.delta ?? null;
  const isPositive = delta === null
    ? null
    : card.invertDelta ? delta < 0 : delta > 0;
  const isNeutral = delta === 0;

  // Safe TrendIcon: no non-null assertion needed — explicit null check first
  const TrendIcon = delta === null || isNeutral ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaLabel = delta !== null ? `${delta > 0 ? '+' : ''}${delta}%` : null;

  const series: SeriesPoint[] = metric?.series ?? [];

  return (
    <div className="flex-1 flex flex-col px-4 pt-3 pb-3 min-w-[200px]">
      {/* Value + delta */}
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-xl font-bold tracking-tight text-foreground">
          {isLoading ? (
            <span className="inline-block w-12 h-5 bg-muted animate-pulse rounded" />
          ) : (
            card.format(metric?.value ?? 0)
          )}
        </span>
        {!isLoading && delta !== null && (
          <div
            className={cn(
              'flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0',
              isNeutral
                ? 'bg-muted text-muted-foreground'
                : isPositive
                  ? 'bg-success text-success-foreground'
                  : 'bg-error text-error-foreground'
            )}
          >
            <TrendIcon size={10} />
            {deltaLabel}
          </div>
        )}
      </div>

      {/* Label */}
      <p className="text-xs text-muted-foreground truncate mb-2">{card.label}</p>

      {/* Sparkline or skeleton */}
      {isLoading ? (
        <SparklineSkeleton />
      ) : (
        <div className="h-10 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            {card.chartType === 'bar' ? (
              <BarChart data={series} barSize={5} barGap={2}>
                <Tooltip content={<SparkTooltip format={card.format} />} cursor={false} />
                <Bar dataKey="value" fill={card.color} radius={[2, 2, 0, 0]} opacity={0.85} />
              </BarChart>
            ) : (
              <AreaChart data={series}>
                <defs>
                  <linearGradient id={card.gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={card.color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={card.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip content={<SparkTooltip format={card.format} />} cursor={false} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={card.color}
                  strokeWidth={1.5}
                  fill={`url(#${card.gradientId})`}
                  dot={false}
                  activeDot={{ r: 3, fill: card.color, strokeWidth: 0 }}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function AnalyticsCards() {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<RangePreset>('7d');
  const { data, isLoading, isError, resolvedRange } = useAnalytics({ preset });

  const rangeLabel = resolvedRange.from === resolvedRange.to
    ? resolvedRange.from
    : `${resolvedRange.from} – ${resolvedRange.to}`;

  // Inject translated labels at render time
  const labelMap: Record<OverviewKey, string> = {
    totalMessages:  t('home.analytics.totalMessages'),
    autonomyRate:   t('home.analytics.autonomyRate'),
    avgResponseMs:  t('home.analytics.avgResponseTime'),
    activeGuests:   t('home.analytics.activeGuests'),
    newGuests:      t('home.analytics.newGuests'),
  };
  const cards: CardConfig[] = CARD_CONFIGS.map((c) => ({ ...c, label: labelMap[c.key] }));

  return (
    <Card>
      {/* Header row */}
      <div className="overflow-x-auto scrollbar-hide border-b border-border/50">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 min-w-max">
          <div className="flex items-center gap-1">
            {PRESET_VALUES.map((value) => (
              <button
                key={value}
                onClick={() => setPreset(value)}
                className={cn(
                  'text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors whitespace-nowrap',
                  preset === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {t(`home.analytics.presets.${value}`)}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap ps-4">{rangeLabel}</span>
        </div>
      </div>

      {/* Error banner */}
      {isError && (
        <div className="px-4 py-2 text-xs text-error-foreground bg-error border-b border-error-border">
          {t('home.analytics.failedToLoad')}
        </div>
      )}

      {/* Metric items */}
      <div className="overflow-x-auto scrollbar-hide">
      <div className="flex divide-x min-w-max">
        {cards.map((card) => (
          <AnalyticItem
            key={card.key}
            card={card}
            metric={data?.[card.key]}
            isLoading={isLoading}
          />
        ))}
      </div>
      </div>
    </Card>
  );
}
