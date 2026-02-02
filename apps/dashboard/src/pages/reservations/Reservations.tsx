import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
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
  reservationStatusFilters,
  reservationStatusVariants,
} from '@/lib/config';
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
  const { data, isLoading } = useQuery({
    queryKey: ['reservations', searchQuery, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', '50');
      const queryString = params.toString();
      return api.get<{ reservations: Reservation[]; total: number }>(
        `/reservations${queryString ? `?${queryString}` : ''}`
      );
    },
  });

  const handleSearch = () => {
    setSearchQuery(search);
  };

  const reservations = data?.reservations || [];
  const today = todayData;

  const columns: Column<Reservation>[] = [
    {
      key: 'confirmationNumber',
      header: 'Confirmation',
      render: (reservation) => (
        <span className="text-sm font-mono font-medium">
          {reservation.confirmationNumber}
        </span>
      ),
    },
    {
      key: 'guest',
      header: 'Guest',
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
              <Badge variant="dark" className="ml-2">
                <Crown className="w-3 h-3 mr-1" />
                VIP
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Unknown guest</span>
        )
      ),
    },
    {
      key: 'room',
      header: 'Room',
      render: (reservation) => (
        <div className="text-sm">
          {reservation.roomNumber || '-'}
          <span className="text-muted-foreground ml-1">
            ({reservation.roomType})
          </span>
        </div>
      ),
    },
    {
      key: 'arrivalDate',
      header: 'Arrival',
      render: (reservation) => (
        <div className="text-sm">
          {formatDate(reservation.arrivalDate)}
          {reservation.estimatedArrival && (
            <span className="text-muted-foreground ml-1">
              {reservation.estimatedArrival}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'departureDate',
      header: 'Departure',
      render: (reservation) => (
        <span className="text-sm">
          {formatDate(reservation.departureDate)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
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
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      ),
    },
  ];

  return (
    <PageContainer>
      {today && (
        <StatsBar
          items={[
            { label: 'Arrivals', value: today.arrivals.count, icon: LogIn, variant: 'success', subtitle: today.arrivals.pending > 0 ? `${today.arrivals.pending} pending` : undefined },
            { label: 'Departures', value: today.departures.count, icon: LogOut, variant: 'warning', subtitle: today.departures.late > 0 ? `${today.departures.late} late` : undefined },
            { label: 'In-House', value: today.inHouse, icon: Home },
            { label: 'Occupancy', value: `${today.occupancyRate}%`, icon: Users },
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
          placeholder: 'Search reservations...',
        }}
        loading={isLoading}
        onRowClick={(reservation) => navigate(`/reservations/${reservation.id}`)}
        emptyState={
          <EmptyState
            icon={Calendar}
            title="No reservations found"
            description={searchQuery ? 'Try a different search term' : 'Reservations will appear here'}
          />
        }
      />
    </PageContainer>
  );
}
