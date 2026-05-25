import { useSearchParams } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import { Select, SelectItem, DateRangePicker, type DateRangeValue } from '@/components/ui';
import { useSession } from '@/features/auth/useAuth';
import { useTeam } from '@/features/team/useTeam';
import { useLiveStats, useKpis, useTrends, useBreakdowns } from './useAnalytics';
import { LiveStrip } from './LiveStrip';
import { KpiCards } from './KpiCards';
import { TrendCharts } from './TrendCharts';
import { Breakdowns } from './Breakdowns';

const TEAM = 'team'; // sentinel for the all-team option in the admin switcher
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Analytics — backend-backed operational + historical metrics. The live strip
 * reads current state; KPI cards / trends / breakdowns read the episodes
 * projection. All filters live in the URL so a view reloads and shares.
 */
export function AnalyticsPage() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';

  const [params, setParams] = useSearchParams();

  // Date window (inclusive YYYY-MM-DD), defaulting to the last 7 days.
  const today = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(today.getDate() - 6);
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const from = fromParam && ISO.test(fromParam) ? fromParam : iso(weekAgo);
  const to = toParam && ISO.test(toParam) ? toParam : iso(today);

  // Admin-only scope: a specific agent, or the whole team (absent param).
  const scope = isAdmin && params.get('agent') ? params.get('agent')! : TEAM;
  const agentId = scope !== TEAM ? scope : null;

  const setRange = (v: DateRangeValue) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('from', v.from);
        p.set('to', v.to);
        return p;
      },
      { replace: true },
    );
  const setScope = (next: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === TEAM) p.delete('agent');
        else p.set('agent', next);
        return p;
      },
      { replace: true },
    );

  const { data: live } = useLiveStats(agentId);
  const { data: kpis } = useKpis(from, to, agentId);
  const { data: trends } = useTrends(from, to, agentId);
  const { data: breakdowns } = useBreakdowns(from, to, agentId);

  // Staff list for the switcher (admin-only endpoint; only fetched for admins).
  const team = useTeam();
  const members = (team.data?.members ?? []).filter((m) => m.status === 'active');

  // Who the numbers are about, for the labels: undefined = the whole team,
  // self = the viewer ("you"), otherwise the selected person's first name.
  const subject: { label: string; self: boolean } | undefined = !isAdmin
    ? { label: 'you', self: true }
    : agentId == null
      ? undefined
      : agentId === user?.id
        ? { label: 'you', self: true }
        : { label: (members.find((m) => m.id === agentId)?.name ?? 'agent').split(' ')[0], self: false };

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <PageHeader
          title="Analytics"
          subtitle="What needs attention right now, and how it's trending"
          action={
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {isAdmin && (
                <div className="w-44">
                  <Select value={scope} onValueChange={setScope}>
                    <SelectItem value={TEAM}>Everyone</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              )}
              <DateRangePicker value={{ from, to }} onChange={setRange} />
            </div>
          }
        />

        <LiveStrip stats={live} subject={subject} />
        <KpiCards stats={kpis} subject={subject} />
        <TrendCharts stats={trends} subject={subject} />
        <Breakdowns stats={breakdowns} subject={subject} />
      </div>
    </PageShell>
  );
}
