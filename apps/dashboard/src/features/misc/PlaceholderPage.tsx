import { PageShell } from '@/components/PageShell';

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <PageShell>
      <div className="mx-auto max-w-2xl px-4 py-10 md:px-8">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">Coming soon.</p>
      </div>
    </PageShell>
  );
}
