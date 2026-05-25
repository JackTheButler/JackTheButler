import { useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import { Select, SelectItem } from '@/components/ui';
import { useSession } from '@/features/auth/useAuth';
import { useTeam } from '@/features/team/useTeam';
import { useLiveStats } from './useAnalytics';
import { LiveStrip } from './LiveStrip';

const TEAM = 'team'; // sentinel for the all-team option in the admin switcher

/**
 * Analytics — the real, backend-backed counterpart to the Reports mockup. Built
 * section by section from data the current schema can actually serve (no mocks).
 */
export function AnalyticsPage() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';

  // Admin-only scope switcher: Team (default) or one agent. Agents have no
  // control and always see their own queue.
  const [scope, setScope] = useState<string>(TEAM);
  const agentId = isAdmin && scope !== TEAM ? scope : null;
  const { data } = useLiveStats(agentId);

  // Staff list for the switcher (admin-only endpoint; only fetched for admins).
  const team = useTeam();
  const members = (team.data?.members ?? []).filter((m) => m.status === 'active');

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <PageHeader
          title="Analytics"
          subtitle="What needs attention right now"
          action={
            isAdmin ? (
              <div className="w-44">
                <Select value={scope} onValueChange={setScope}>
                  <SelectItem value={TEAM}>Whole team</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            ) : undefined
          }
        />

        <LiveStrip stats={data} own={!isAdmin} />
      </div>
    </PageShell>
  );
}
