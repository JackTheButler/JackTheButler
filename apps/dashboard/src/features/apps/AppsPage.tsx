import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppSummary, AppStatus } from '@janetheoperator/shared';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import { Toolbar } from '@/components/Toolbar';
import { Loading } from '@/components/Loading';
import {
  Avatar,
  Badge,
  Button,
  SearchInput,
  EmptyState,
  SegmentedControl,
  cn,
} from '@/components/ui';
import { useApps } from './useApps';
import { iconFor } from './icon';

const STATUS: Record<AppStatus, { label: string; tone: 'primary' | 'accent' | 'muted' }> = {
  active: { label: 'Connected', tone: 'primary' },
  disabled: { label: 'Disabled', tone: 'accent' },
  unconfigured: { label: 'Not configured', tone: 'muted' },
  error: { label: 'Error', tone: 'muted' },
};

function AppCard({ app }: { app: AppSummary }) {
  const navigate = useNavigate();
  const s = STATUS[app.status];
  const cardStyle =
    app.status === 'error'
      ? 'border-red-500/40 bg-red-500/[0.03]'
      : app.status === 'active'
        ? 'border-accent/20 bg-accent-soft/30'
        : 'border-line';

  // Minimal: only show a badge for the meaningful states (Connected / Error).
  // Disabled / Not configured stay implicit (no badge on the card).
  const showBadge = app.status === 'active' || app.status === 'error';

  return (
    <div className={cn('relative flex flex-col gap-3 rounded-xl border bg-panel p-4', cardStyle)}>
      {showBadge && (
        <Badge
          tone={s.tone}
          className={cn(
            'absolute right-0 top-0 rounded-bl-lg rounded-br-none rounded-tl-none rounded-tr-xl',
            app.status === 'error' && 'text-red-600',
          )}
        >
          {s.label}
        </Badge>
      )}
      <div className={cn('flex items-start gap-3', showBadge && 'pr-24')}>
        <Avatar
          size="md"
          shape="square"
          tone={app.status === 'active' ? 'solid' : 'muted'}
          icon={
            iconFor(app.id) ? (
              <img
                src={iconFor(app.id)}
                alt=""
                className={cn(
                  'h-5 w-5 object-contain',
                  app.status === 'active' && 'invert',
                )}
              />
            ) : undefined
          }
          name={iconFor(app.id) ? undefined : app.name}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{app.name}</h3>
          <p className="truncate text-xs capitalize text-muted">{app.category}</p>
        </div>
      </div>
      <p className="line-clamp-2 text-xs text-muted">{app.description}</p>
      <div className="mt-auto">
        <Button
          variant={app.status === 'active' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => navigate(`/apps/${app.id}`)}
        >
          {app.status === 'active' ? 'Manage' : 'Configure'}
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

        <Toolbar
          className="mt-6"
          filters={
            <SegmentedControl
              aria-label="Filter apps by category"
              options={categories}
              value={activeCategory}
              onChange={setActiveCategory}
              className="-mx-4 px-4 md:mx-0 md:px-0"
            />
          }
          search={
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps…"
              className="w-full sm:w-56"
            />
          }
        />

        <div className="mt-6">
          {isLoading ? (
            <Loading />
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
