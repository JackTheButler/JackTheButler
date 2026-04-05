import { useState } from 'react';
import { Bot, MessageSquare, Cpu, Puzzle, Book, Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { PageContainer, PageHeader, StatsColumn, ActionItems, DemoDataCard } from '@/components';
import { AnalyticsCards } from '@/components/home/AnalyticsCards';
import { ActivityTicker } from '@/components/home/ActivityTicker';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';
import { api } from '@/lib/api';

export function HomePage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canManageSettings = can(PERMISSIONS.SETTINGS_MANAGE);
  const canManageGuests = can(PERMISSIONS.GUESTS_MANAGE);
  const { providers, apps, knowledgeBase, memories, isLoading, refetch } = useSystemStatus();
  const queryClient = useQueryClient();
  const [isBackfilling, setIsBackfilling] = useState(false);

  const kbIndexed = (knowledgeBase?.total ?? 0) - (knowledgeBase?.withoutEmbeddings ?? 0);
  const kbTotal = knowledgeBase?.total ?? 0;

  const memoriesNeedBackfill = (memories?.withEmbeddings ?? 0) < (memories?.total ?? 0);

  async function handleBackfillMemories() {
    setIsBackfilling(true);
    try {
      await api.post('/guests/memories/backfill-embeddings', {});
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
    } finally {
      setIsBackfilling(false);
    }
  }

  const stats = [
    {
      label: t('home.aiProvider'),
      value: providers?.completion ?? t('common.none'),
      icon: Bot,
      variant: providers?.completion ? 'success' : 'error',
    },
    {
      label: t('home.embeddings'),
      value: providers?.embedding ?? t('common.none'),
      icon: Cpu,
      variant: providers?.embedding ? 'success' : 'error',
    },
    {
      label: t('home.channels'),
      value: apps?.channel ?? 0,
      icon: MessageSquare,
      variant: (apps?.channel ?? 0) > 0 ? 'success' : 'warning',
    },
    {
      label: t('home.apps'),
      value: (apps?.ai ?? 0) + (apps?.channel ?? 0) + (apps?.pms ?? 0) + (apps?.tool ?? 0),
      icon: Puzzle,
      variant: 'default',
    },
    {
      label: t('home.knowledge'),
      value: `${kbIndexed}/${kbTotal}`,
      icon: Book,
      variant: kbTotal === 0 ? 'warning' : knowledgeBase?.needsReindex ? 'warning' : 'success',
      progress: kbTotal > 0 ? kbIndexed / kbTotal : 0,
    },
    {
      label: t('home.memories'),
      value: `${memories?.withEmbeddings ?? 0}/${memories?.total ?? 0}`,
      icon: Brain,
      variant: memoriesNeedBackfill ? 'warning' : (memories?.total ?? 0) > 0 ? 'success' : 'default',
      progress: (memories?.total ?? 0) > 0 ? (memories?.withEmbeddings ?? 0) / (memories?.total ?? 1) : 0,
      ...(memoriesNeedBackfill && canManageGuests && {
        action: {
          hint: t('home.memoriesReembedHint', { count: (memories?.total ?? 0) - (memories?.withEmbeddings ?? 0) }),
          label: isBackfilling ? t('common.loading') : t('home.memoriesReembed'),
          onClick: handleBackfillMemories,
        },
      }),
    },
  ] as const;

  return (
    <PageContainer>
      <PageHeader />

      <div className="space-y-6">
        {/* Analytics Sparklines */}
        <AnalyticsCards />

        {/* Cards Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Live Activity + Getting Started */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <ActivityTicker />
            <ActionItems disabled={!canManageSettings} />
          </div>

          {/* Right column: System Status + Demo Data */}
          <div className="flex flex-col gap-6">
            {!isLoading && <StatsColumn items={[...stats]} />}
            <DemoDataCard disabled={!canManageSettings} />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
