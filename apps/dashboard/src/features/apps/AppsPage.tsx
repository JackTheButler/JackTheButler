import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppSummary, AppStatus } from '@janetheoperator/shared';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import {
  Avatar,
  Badge,
  Button,
  SearchInput,
  EmptyState,
  SegmentedControl,
} from '@/components/ui';
import { useApps } from './useApps';

const STATUS: Record<AppStatus, { label: string; tone: 'primary' | 'accent' | 'muted' }> = {
  active: { label: 'Connected', tone: 'primary' },
  disabled: { label: 'Disabled', tone: 'accent' },
  unconfigured: { label: 'Not configured', tone: 'muted' },
  error: { label: 'Error', tone: 'muted' },
};

function AppCard({ app }: { app: AppSummary }) {
  const navigate = useNavigate();
  const s = STATUS[app.status];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <div className="flex items-start gap-3">
        <Avatar size="md" shape="square" tone="muted" name={app.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{app.name}</h3>
          <p className="truncate text-xs capitalize text-muted">{app.category}</p>
        </div>
        <Badge tone={s.tone} className={app.status === 'error' ? 'text-red-600' : undefined}>
          {s.label}
        </Badge>
      </div>
      <div className="mt-auto">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => navigate(`/apps/${app.id}`)}
        >
          Configure
        </Button>
      </div>
    </div>
  );
}

export function AppsPage() {
  const { data, isLoading } = useApps();
  const apps = data?.apps ?? [];

  const categories = useMemo(
    () => ['All', ...new Set(apps.map((a) => a.category))],
    [apps],
  );
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const filtered = apps.filter((a) => {
    if (activeCategory !== 'All' && a.category !== activeCategory) return false;
    const q = query.trim().toLowerCase();
    return !q || a.name.toLowerCase().includes(q);
  });

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <PageHeader
          title="Apps"
          subtitle={`Channels and AI providers. ${apps.length} registered.`}
        />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            aria-label="Filter apps by category"
            options={categories}
            value={activeCategory}
            onChange={setActiveCategory}
            className="-mx-4 px-4 md:mx-0 md:px-0"
          />
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps…"
            className="w-full sm:w-56"
          />
        </div>

        <div className="mt-6">
          {isLoading ? (
            <EmptyState>Loading…</EmptyState>
          ) : filtered.length === 0 ? (
            <EmptyState>No apps match your filters.</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
