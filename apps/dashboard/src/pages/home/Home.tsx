import { Bot, MessageSquare, Cpu, Plug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageContainer, PageHeader, StatsBar, ActionItems } from '@/components';
import { useSystemStatus } from '@/hooks/useSystemStatus';

export function HomePage() {
  const { t } = useTranslation();
  const { providers, extensions, isLoading } = useSystemStatus();

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

        {/* Getting Started */}
        <ActionItems />
      </div>
    </PageContainer>
  );
}
