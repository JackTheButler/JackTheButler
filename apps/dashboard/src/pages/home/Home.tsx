import { Bot, MessageSquare, Cpu, Plug, Book } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageContainer, PageHeader, StatsBar, ActionItems, DemoDataCard } from '@/components';
import { useSystemStatus } from '@/hooks/useSystemStatus';

export function HomePage() {
  const { t } = useTranslation();
  const { providers, extensions, knowledgeBase, isLoading } = useSystemStatus();

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
      value: extensions?.channel ?? 0,
      icon: MessageSquare,
      variant: (extensions?.channel ?? 0) > 0 ? 'success' : 'warning',
    },
    {
      label: t('home.knowledge'),
      value: `${kbIndexed}/${kbTotal}`,
      icon: Book,
      variant: kbTotal === 0 ? 'warning' : knowledgeBase?.needsReindex ? 'warning' : 'success',
    },
    {
      label: t('home.extensions'),
      value: (extensions?.ai ?? 0) + (extensions?.channel ?? 0) + (extensions?.pms ?? 0) + (extensions?.tool ?? 0),
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
            <ActionItems />
          </div>

          {/* Demo Data - 1/3 */}
          <div>
            <DemoDataCard />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
