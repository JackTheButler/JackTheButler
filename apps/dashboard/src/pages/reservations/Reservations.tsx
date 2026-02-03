import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  LogIn,
  LogOut,
  Home,
  Users,
  ChevronRight,
  Crown,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/formatters';
import {
  getReservationStatusFilters,
  reservationStatusVariants,
} from '@/lib/config';
import { useFilteredQuery } from '@/hooks/useFilteredQuery';
import type { Reservation, ReservationStatus } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { PageContainer, EmptyState, DataTable, StatsBar } from '@/components';
import type { Column } from '@/components/DataTable';

interface TodayStats {
  date: string;
  arrivals: { count: number; pending: number; checkedIn: number };
  departures: { count: number; checkedOut: number; late: number };
  inHouse: number;
  occupancyRate: number;
}

export function ReservationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | 'all'>('all');

  // Fetch today's stats
  const { data: todayData } = useQuery({
    queryKey: ['reservations', 'today'],
    queryFn: () => api.get<TodayStats>('/reservations/today'),
    refetchInterval: 30000,
  });

  // Fetch reservations list
  const { data, isLoading } = useFilteredQuery<{ reservations: Reservation[]; total: number }>({
    queryKey: 'reservations',
    endpoint: '/reservations',
    params: { search: searchQuery, status: statusFilter, limit: 50 },
  });

  const handleSearch = () => {
    setSearchQuery(search);
  };

  const reservations = data?.reservations || [];
  const today = todayData;
  const reservationStatusFilters = getReservationStatusFilters(t);

  const columns: Column<Reservation>[] = [
    {
      key: 'confirmationNumber',
      header: t('reservations.confirmation'),
      render: (reservation) => (
        <span className="text-sm font-mono font-medium">
          {reservation.confirmationNumber}
        </span>
      ),
    },
    {
      key: 'guest',
      header: t('common.guest'),
      render: (reservation) => (
        reservation.guest ? (
          <div>
            <Link
              to={`/guests/${reservation.guestId}`}
              className="text-sm font-medium hover:text-primary"
              onClick={(e) => e.stopPropagation()}
            >
              {reservation.guest.firstName} {reservation.guest.lastName}
            </Link>
            {reservation.guest.vipStatus && (
              <Badge variant="dark" className="ms-2">
                <Crown className="w-3 h-3 me-1" />
                {t('common.vip')}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">{t('reservations.unknownGuest')}</span>
        )
      ),
    },
    {
      key: 'room',
      header: t('common.room'),
      render: (reservation) => (
        <div className="text-sm">
          {reservation.roomNumber || '-'}
          <span className="text-muted-foreground ms-1">
            ({reservation.roomType})
          </span>
        </div>
      ),
    },
    {
      key: 'arrivalDate',
      header: t('reservations.arrival'),
      render: (reservation) => (
        <div className="text-sm">
          {formatDate(reservation.arrivalDate)}
          {reservation.estimatedArrival && (
            <span className="text-muted-foreground ms-1">
              {reservation.estimatedArrival}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'departureDate',
      header: t('reservations.departure'),
      render: (reservation) => (
        <span className="text-sm">
          {formatDate(reservation.departureDate)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (reservation) => (
        <Badge variant={reservationStatusVariants[reservation.status]} className="capitalize">
          {reservation.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: () => (
        <ChevronRight className="w-5 h-5 text-muted-foreground rtl:rotate-180" />
      ),
    },
  ];

  return (
    <PageContainer>
      {today && (
        <StatsBar
          items={[
            { label: t('reservations.arrivals'), value: today.arrivals.count, icon: LogIn, variant: 'success', subtitle: today.arrivals.pending > 0 ? `${today.arrivals.pending} ${t('reservations.pending')}` : undefined },
            { label: t('reservations.departures'), value: today.departures.count, icon: LogOut, variant: 'warning', subtitle: today.departures.late > 0 ? `${today.departures.late} ${t('reservations.late')}` : undefined },
            { label: t('reservations.inHouse'), value: today.inHouse, icon: Home },
            { label: t('reservations.occupancy'), value: `${today.occupancyRate}%`, icon: Users },
          ]}
        />
      )}

      <DataTable
        data={reservations}
        columns={columns}
        keyExtractor={(reservation) => reservation.id}
        filters={
          <FilterTabs
            options={reservationStatusFilters}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        }
        search={{
          value: search,
          onChange: setSearch,
          onSearch: handleSearch,
          onClear: () => setSearchQuery(''),
          placeholder: t('reservations.searchReservations'),
        }}
        loading={isLoading}
        onRowClick={(reservation) => navigate(`/reservations/${reservation.id}`)}
        emptyState={
          <EmptyState
            icon={Calendar}
            title={t('reservations.noReservations')}
            description={searchQuery ? t('reservations.noReservationsSearch') : t('reservations.noReservationsEmpty')}
          />
        }
      />
    </PageContainer>
  );
}
