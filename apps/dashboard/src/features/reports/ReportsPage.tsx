import { useMemo, useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import { Select, SelectItem, SegmentedControl } from '@/components/ui';
import { AGENTS, RANGES, type Agent, type Range, type Kpi, kpis, agentKpis, agentQueue, queue } from './mock';
import { StatTile } from './primitives';
import { LiveStrip } from './LiveStrip';
import { MyConversations } from './MyConversations';
import { TeamAnalytics } from './TeamAnalytics';
import { AgentAnalytics } from './AgentAnalytics';

/**
 * Reports has two modes, driven by the agent filter:
 *  • "All agents"   → analytical team dashboard (KPIs + charts).
 *  • a specific name → operational personal view (their queue + stats up top),
 *                      with the team analytics demoted into a collapsible below.
 */
export function ReportsPage() {
  const [range, setRange] = useState<Range>('7d');
  const [agent, setAgent] = useState<Agent>('All agents');
  const isTeam = agent === 'All agents';

  const stats = useMemo<Kpi[]>(
    () => (isTeam ? kpis(range) : agentKpis(agent)),
    [isTeam, agent, range],
  );

  const liveStats = useMemo(() => {
    if (isTeam) {
      return [
        { label: 'Unassigned', value: queue.unassigned },
        { label: 'Awaiting reply', value: queue.awaitingReply },
        { label: 'Oldest wait', value: `${queue.oldestWaitMin}m` },
        { label: 'Agents online', value: queue.onlineAgents },
      ];
    }
    const q = agentQueue(agent);
    return [
      { label: 'My open', value: q.open },
      { label: 'Awaiting my reply', value: q.awaitingReply },
      { label: 'Oldest wait', value: `${q.oldestWaitMin}m` },
      { label: 'Resolved today', value: q.resolvedToday },
    ];
  }, [isTeam, agent]);

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <PageHeader
          title="Reports"
          subtitle={isTeam ? 'How Jane and the team are performing' : `${agent}'s performance`}
          action={
            <div className="flex items-center gap-2">
              <div className="w-40">
                <Select value={agent} onValueChange={(v) => setAgent(v as Agent)}>
                  {AGENTS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <SegmentedControl
                aria-label="Date range"
                options={RANGES}
                value={range}
                onChange={setRange}
              />
            </div>
          }
        />

        <LiveStrip stats={liveStats} />

        <div className="mt-4 grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {stats.map(({ id, ...k }) => (
            <StatTile key={id} {...k} />
          ))}
        </div>

        {isTeam ? (
          <div className="mt-4">
            <TeamAnalytics range={range} />
          </div>
        ) : (
          <>
            <div className="mt-4">
              <MyConversations agent={agent} />
            </div>
            <div className="mt-4">
              <AgentAnalytics agent={agent} range={range} />
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
