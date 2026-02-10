import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageContainer, StatsBar, EmptyState, DataTable } from '@/components';
import { usePageActions } from '@/contexts/PageActionsContext';
import type { Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Users,
  Crown,
  Star,
  UserPlus,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { vipVariants, loyaltyVariants } from '@/lib/config';
import { useFilteredQuery } from '@/hooks/useFilteredQuery';
import type { Guest } from '@/types/api';

interface GuestStats {
  total: number;
  vip: number;
  repeatGuests: number;
  newThisMonth: number;
}

export function GuestsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setActions } = usePageActions();
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActions([
      {
        id: 'add-guest',
        label: t('guests.addGuest'),
        icon: Plus,
        href: '/guests/new',
      },
    ]);
    return () => setActions([]);
  }, [setActions, t]);

  const { data: stats } = useQuery({
    queryKey: ['guestStats'],
    queryFn: () => api.get<GuestStats>('/guests/stats'),
  });

  const { data, isLoading } = useFilteredQuery<{ guests: Guest[]; total: number }>({
    queryKey: 'guests',
    endpoint: '/guests',
    params: { search: searchQuery, limit: 50 },
  });

  const guests = data?.guests || [];

  const handleSearch = () => {
    setSearchQuery(search);
  };

  const columns: Column<Guest>[] = [
    {
      key: 'name',
      header: t('common.name'),
      render: (guest) => (
        <div>
          <Link
            to={`/guests/${guest.id}`}
            className="font-medium text-foreground hover:text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            {guest.firstName} {guest.lastName}
          </Link>
          {guest.tags.length > 0 && (
            <div className="flex gap-1 mt-1">
              {guest.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded"
                >
                  {tag}
                </span>
              ))}
              {guest.tags.length > 2 && (
                <span className="text-xs text-muted-foreground/70">
                  +{guest.tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'contact',
      header: t('common.contact'),
      render: (guest) => (
        <div className="text-sm">
          <div className="text-muted-foreground truncate max-w-[200px]">
            {guest.email || <span className="text-muted-foreground/70 italic">{t('common.noEmail')}</span>}
          </div>
          {guest.phone && (
            <div className="text-muted-foreground text-xs">{guest.phone}</div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (guest) => (
        <div className="flex gap-1.5">
          {guest.vipStatus && guest.vipStatus !== 'none' && (
            <Badge variant={vipVariants[guest.vipStatus.toLowerCase()] || 'dark'}>
              <Crown className="w-3 h-3 me-1" />
              {guest.vipStatus}
            </Badge>
          )}
          {guest.loyaltyTier && guest.loyaltyTier !== 'none' && (
            <Badge variant={loyaltyVariants[guest.loyaltyTier] || 'default'}>
              {guest.loyaltyTier}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'stayCount',
      header: t('guests.stays'),
      className: 'text-right',
      render: (guest) => <span className="font-medium">{guest.stayCount}</span>,
    },
    {
      key: 'totalRevenue',
      header: t('guests.revenue'),
      className: 'text-right',
      render: (guest) => (
        <span className="text-muted-foreground">{formatCurrency(guest.totalRevenue)}</span>
      ),
    },
    {
      key: 'lastStayDate',
      header: t('guests.lastStay'),
      render: (guest) => (
        <span className="text-muted-foreground text-sm">{formatDate(guest.lastStayDate)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      render: () => <ChevronRight className="w-4 h-4 text-muted-foreground rtl:rotate-180" />,
    },
  ];


  return (
    <PageContainer>
      {error && (
        <Alert variant="destructive" className="mb-6" onDismiss={() => setError(null)}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {stats && (
        <StatsBar
          items={[
            { label: t('guests.totalGuests'), value: stats.total, icon: Users, variant: 'default' },
            { label: t('guests.vipGuests'), value: stats.vip, icon: Crown, variant: 'warning' },
            { label: t('guests.repeatGuests'), value: stats.repeatGuests, icon: Star, variant: 'success' },
            { label: t('guests.newThisMonth'), value: stats.newThisMonth, icon: UserPlus, variant: 'default' },
          ]}
        />
      )}

      <DataTable
        data={guests}
        columns={columns}
        keyExtractor={(guest) => guest.id}
        search={{
          value: search,
          onChange: setSearch,
          onSearch: handleSearch,
          onClear: () => setSearchQuery(''),
          placeholder: t('guests.searchGuests'),
        }}
        loading={isLoading}
        onRowClick={(guest) => navigate(`/guests/${guest.id}`)}
        emptyState={
          <EmptyState
            icon={Users}
            title={t('guests.noGuests')}
            description={
              searchQuery
                ? t('guests.noGuestsSearch')
                : t('guests.noGuestsEmpty')
            }
          />
        }
      />
    </PageContainer>
  );
}
