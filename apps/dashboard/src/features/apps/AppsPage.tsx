import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Badge, Button, Input, SegmentedControl } from '@/components/ui';
import { apps, appCategories, type AppEntry, type AppStatus } from '@/mock/apps';

const CATEGORY_FILTERS = ['All', ...appCategories] as const;

const STATUS: Record<AppStatus, { label: string; tone: 'accent' | 'muted' }> = {
  active: { label: 'Connected', tone: 'accent' },
  available: { label: 'Not connected', tone: 'muted' },
  soon: { label: 'Coming soon', tone: 'muted' },
};

function AppCard({ app }: { app: AppEntry }) {
  const Icon = app.icon;
  const status = STATUS[app.status];
  const isSoon = app.status === 'soon';
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface ring-1 ring-line">
          <Icon size={18} className="text-ink" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{app.name}</h3>
            <Badge tone={status.tone} className="shrink-0">
              {status.label}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted">{app.vendor}</p>
        </div>
      </div>
      <p className="line-clamp-2 text-xs text-muted">{app.description}</p>
      <Button
        disabled={isSoon}
        variant={app.status === 'active' ? 'outline' : 'primary'}
        className="mt-auto self-start"
      >
        {app.status === 'active' ? 'Manage' : isSoon ? 'Coming soon' : 'Connect'}
      </Button>
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
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Apps</h1>
            <p className="mt-1 text-sm text-muted">
              Connect channels, AI models, and tools. {apps.length} available.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps…"
              className="pl-9"
            />
          </div>
        </header>

        <SegmentedControl
          aria-label="Filter apps by category"
          options={CATEGORY_FILTERS}
          value={activeCategory}
          onChange={setActiveCategory}
          className="-mx-4 mt-6 px-4 md:-mx-8 md:px-8"
        />

        <div className="mt-8 space-y-8">
          {appCategories.map((category) => {
            const inCategory = filtered.filter((a) => a.category === category);
            if (inCategory.length === 0) return null;
            return (
              <section key={category}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  {category}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {inCategory.map((app) => (
                    <AppCard key={app.id} app={app} />
                  ))}
                </div>
              </section>
            );
          })}

          {filtered.length === 0 && (
            <p className="py-16 text-center text-sm text-muted">No apps match your filters.</p>
          )}
        </div>
      </div>
    </PageShell>
  );
}
