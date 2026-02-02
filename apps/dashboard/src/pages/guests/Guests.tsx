import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, StatsBar, EmptyState, DataTable } from '@/components';
import { usePageActions } from '@/contexts/PageActionsContext';
import type { Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
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

interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  language: string;
  loyaltyTier: string | null;
  vipStatus: string | null;
  preferences: string[];
  tags: string[];
  stayCount: number;
  totalRevenue: number;
  lastStayDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GuestStats {
  total: number;
  vip: number;
  repeatGuests: number;
  newThisMonth: number;
}

const vipColors: Record<string, string> = {
  diamond: '!bg-gray-700 !text-white',
  platinum: '!bg-gray-700 !text-white',
  gold: '!bg-yellow-500 !text-white',
  silver: '!bg-gray-700 !text-white',
};

const loyaltyColors: Record<string, string> = {
  platinum: 'bg-gray-100 text-gray-600',
  gold: 'bg-yellow-100 text-yellow-700',
  silver: 'bg-gray-100 text-gray-600',
  member: 'bg-gray-100 text-gray-600',
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export function GuestsPage() {
  const navigate = useNavigate();
  const { setActions } = usePageActions();
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActions(
      <Link to="/guests/new">
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Guest
        </Button>
      </Link>
    );
    return () => setActions(null);
  }, [setActions]);

  const { data: stats } = useQuery({
    queryKey: ['guestStats'],
    queryFn: () => api.get<GuestStats>('/guests/stats'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['guests', searchQuery],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      params.set('limit', '50');
      return api.get<{ guests: Guest[]; total: number }>(`/guests?${params.toString()}`);
    },
  });

  const guests = data?.guests || [];

  const handleSearch = () => {
    setSearchQuery(search);
  };

  const columns: Column<Guest>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (guest) => (
        <div>
          <Link
            to={`/guests/${guest.id}`}
            className="font-medium text-gray-900 hover:text-blue-600"
            onClick={(e) => e.stopPropagation()}
          >
            {guest.firstName} {guest.lastName}
          </Link>
          {guest.tags.length > 0 && (
            <div className="flex gap-1 mt-1">
              {guest.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
                >
                  {tag}
                </span>
              ))}
              {guest.tags.length > 2 && (
                <span className="text-xs text-gray-400">
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
      header: 'Contact',
      render: (guest) => (
        <div className="text-sm">
          <div className="text-gray-600 truncate max-w-[200px]">
            {guest.email || <span className="text-gray-400 italic">No email</span>}
          </div>
          {guest.phone && (
            <div className="text-gray-500 text-xs">{guest.phone}</div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (guest) => (
        <div className="flex gap-1.5">
          {guest.vipStatus && guest.vipStatus !== 'none' && (
            <Badge className={guest.vipStatus.toLowerCase() === 'gold' ? '!bg-yellow-500 !text-white' : '!bg-gray-700 !text-white'}>
              <Crown className="w-3 h-3 mr-1" />
              {guest.vipStatus}
            </Badge>
          )}
          {guest.loyaltyTier && guest.loyaltyTier !== 'none' && (
            <Badge className={loyaltyColors[guest.loyaltyTier] || 'bg-gray-100 text-gray-600'}>
              {guest.loyaltyTier}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'stayCount',
      header: 'Stays',
      className: 'text-right',
      render: (guest) => <span className="font-medium">{guest.stayCount}</span>,
    },
    {
      key: 'totalRevenue',
      header: 'Revenue',
      className: 'text-right',
      render: (guest) => (
        <span className="text-gray-600">{formatCurrency(guest.totalRevenue)}</span>
      ),
    },
    {
      key: 'lastStayDate',
      header: 'Last Stay',
      render: (guest) => (
        <span className="text-gray-500 text-sm">{formatDate(guest.lastStayDate)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      render: () => <ChevronRight className="w-4 h-4 text-gray-400" />,
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
            { label: 'Total Guests', value: stats.total, icon: Users, variant: 'default' },
            { label: 'VIP Guests', value: stats.vip, icon: Crown, variant: 'warning' },
            { label: 'Repeat Guests', value: stats.repeatGuests, icon: Star, variant: 'success' },
            { label: 'New This Month', value: stats.newThisMonth, icon: UserPlus, variant: 'default' },
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
          placeholder: 'Search guests...',
        }}
        loading={isLoading}
        onRowClick={(guest) => navigate(`/guests/${guest.id}`)}
        emptyState={
          <EmptyState
            icon={Users}
            title="No guests found"
            description={
              searchQuery
                ? 'Try changing your search'
                : 'Add your first guest to get started'
            }
          />
        }
      />
    </PageContainer>
  );
}
