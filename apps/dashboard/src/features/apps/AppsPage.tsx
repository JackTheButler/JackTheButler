import { useMemo, useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import {
  Avatar,
  Badge,
  Button,
  SearchInput,
  EmptyState,
  SegmentedControl,
  cn,
} from '@/components/ui';
import { apps, appCategories, type AppEntry } from '@/mock/apps';

const CATEGORY_FILTERS = ['All', ...appCategories] as const;

function AppCard({ app }: { app: AppEntry }) {
  const Icon = app.icon;
  const isSoon = app.status === 'soon';
  const cardStyle =
    app.status === 'error'
      ? 'border-red-500/40 bg-red-500/[0.03]'
      : app.status === 'active'
        ? 'border-accent/20 bg-accent-soft/30'
        : '';
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-line bg-panel p-4',
        cardStyle,
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar
          size="md"
          shape="square"
          tone={app.status === 'active' ? 'solid' : 'muted'}
          icon={
            <Icon size={18} className={app.status === 'active' ? undefined : 'text-ink'} />
          }
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{app.name}</h3>
          <p className="truncate text-xs text-muted">{app.category}</p>
        </div>
      </div>
      <p className="line-clamp-2 text-xs text-muted">{app.description}</p>
      <div className="mt-auto flex items-center justify-between gap-2">
        <Button
          disabled={isSoon}
          variant={
            app.status === 'error'
              ? 'destructive'
              : app.status === 'active'
                ? 'primary'
                : 'outline'
          }
        >
          {app.status === 'error'
            ? 'Fix'
            : app.status === 'active'
              ? 'Manage'
              : isSoon
                ? 'Coming soon'
                : 'Connect'}
        </Button>
        {app.status === 'active' && <Badge tone="accent">Connected</Badge>}
        {app.status === 'error' && (
          <Badge tone="muted" className="text-red-600">
            Error
          </Badge>
        )}
      </div>
    </div>
  );
}

export function AppsPage() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] =
    useState<(typeof CATEGORY_FILTERS)[number]>('All');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => {
      if (activeCategory !== 'All' && a.category !== activeCategory) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.vendor.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      );
    });
  }, [query, activeCategory]);

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <PageHeader
          title="Apps"
          subtitle={`Connect channels, AI models, and tools. ${apps.length} available.`}
        />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            aria-label="Filter apps by category"
            options={CATEGORY_FILTERS}
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
          {filtered.length === 0 ? (
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
