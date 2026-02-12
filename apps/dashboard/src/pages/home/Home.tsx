import { Bot, MessageSquare, Cpu, Plug, Book } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageContainer, PageHeader, StatsBar, ActionItems, DemoDataCard } from '@/components';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';

export function HomePage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canManageSettings = can(PERMISSIONS.SETTINGS_MANAGE);
  const { providers, apps, knowledgeBase, isLoading } = useSystemStatus();

  const kbIndexed = (knowledgeBase?.total ?? 0) - (knowledgeBase?.withoutEmbeddings ?? 0);
  const kbTotal = knowledgeBase?.total ?? 0;

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
      label: t('home.knowledge'),
      value: `${kbIndexed}/${kbTotal}`,
      icon: Book,
      variant: kbTotal === 0 ? 'warning' : knowledgeBase?.needsReindex ? 'warning' : 'success',
    },
    {
      label: t('home.apps'),
      value: (apps?.ai ?? 0) + (apps?.channel ?? 0) + (apps?.pms ?? 0) + (apps?.tool ?? 0),
      icon: Plug,
      variant: 'default',
    },
  ] as const;

  return (
    <PageContainer>
      <PageHeader />

      <div className="space-y-6">
        {/* System Status */}
        {!isLoading && <StatsBar items={[...stats]} />}

        {/* Cards Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Getting Started - 2/3 */}
          <div className="lg:col-span-2">
            <ActionItems disabled={!canManageSettings} />
          </div>

          {/* Demo Data - 1/3 */}
          <div>
            <DemoDataCard disabled={!canManageSettings} />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
