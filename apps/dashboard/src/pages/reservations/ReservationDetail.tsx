import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  User,
  Bed,
  Clock,
  Users,
  MessageSquare,
  ListTodo,
  FileText,
  Star,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatDateShort, formatDateTime } from '@/lib/formatters';
import {
  reservationStatusVariants,
  taskStatusVariants,
} from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { PageContainer, EmptyState } from '@/components';
import type { ReservationStatus } from '@/types/api';

interface GuestDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  vipStatus: string | null;
  loyaltyTier: string | null;
  preferences: string[];
}

interface ReservationDetail {
  id: string;
  confirmationNumber: string;
  guestId: string;
  roomNumber: string | null;
  roomType: string;
  arrivalDate: string;
  departureDate: string;
  estimatedArrival: string | null;
  estimatedDeparture: string | null;
  status: ReservationStatus;
  adults: number;
  children: number;
  specialRequests: string[];
  notes: string[];
  source: string;
  createdAt: string;
  guest: GuestDetail | null;
  _related: {
    conversations: { id: string; channelType: string; state: string; lastMessageAt: string }[];
    tasks: { id: string; type: string; description: string; status: string; priority: string }[];
  };
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: typeof Calendar }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5" />}
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || '-'}</p>
      </div>
    </div>
  );
}

export function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: reservation, isLoading, error } = useQuery({
    queryKey: ['reservation', id],
    queryFn: () => api.get<ReservationDetail>(`/reservations/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  if (error || !reservation) {
    return (
      <PageContainer>
        <EmptyState
          icon={Calendar}
          title="Reservation not found"
          description="The reservation you're looking for doesn't exist"
        />
      </PageContainer>
    );
  }

  const nights = Math.ceil(
    (new Date(reservation.departureDate).getTime() - new Date(reservation.arrivalDate).getTime()) /
    (1000 * 60 * 60 * 24)
  );

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/reservations"
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">
              Reservation #{reservation.confirmationNumber}
            </h1>
            <Badge variant={reservationStatusVariants[reservation.status]} className="capitalize">
              {reservation.status.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {reservation.roomType} • {nights} night{nights !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stay Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Stay Details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <InfoRow
                label="Check-in"
                value={
                  <span>
                    {formatDateShort(reservation.arrivalDate)}
                    {reservation.estimatedArrival && (
                      <span className="text-muted-foreground ml-2">
                        @ {reservation.estimatedArrival}
                      </span>
                    )}
                  </span>
                }
              />
              <InfoRow
                label="Check-out"
                value={
                  <span>
                    {formatDateShort(reservation.departureDate)}
                    {reservation.estimatedDeparture && (
                      <span className="text-muted-foreground ml-2">
                        @ {reservation.estimatedDeparture}
                      </span>
                    )}
                  </span>
                }
              />
              <InfoRow label="Room Number" value={reservation.roomNumber || 'Not assigned'} icon={Bed} />
              <InfoRow label="Room Type" value={reservation.roomType} />
              <InfoRow
                label="Guests"
                value={`${reservation.adults} adult${reservation.adults !== 1 ? 's' : ''}${
                  reservation.children > 0 ? `, ${reservation.children} child${reservation.children !== 1 ? 'ren' : ''}` : ''
                }`}
                icon={Users}
              />
              <InfoRow label="Booking Source" value={reservation.source} />
            </CardContent>
          </Card>

          {/* Special Requests */}
          {reservation.specialRequests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  Special Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {reservation.specialRequests.map((request, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground">•</span>
                      {request}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {reservation.notes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {reservation.notes.map((note, i) => (
                    <li key={i} className="text-sm p-2 bg-muted/50 rounded">
                      {note}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Related Conversations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Conversations
                <Badge variant="secondary" className="ml-auto">
                  {reservation._related.conversations.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reservation._related.conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No conversations for this reservation</p>
              ) : (
                <div className="space-y-2">
                  {reservation._related.conversations.map((conv) => (
                    <Link
                      key={conv.id}
                      to={`/conversations/${conv.id}`}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {conv.channelType}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDateTime(conv.lastMessageAt)}
                        </span>
                      </div>
                      <Badge variant={conv.state === 'active' ? 'success' : 'secondary'}>
                        {conv.state}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Related Tasks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ListTodo className="w-4 h-4" />
                Tasks
                <Badge variant="secondary" className="ml-auto">
                  {reservation._related.tasks.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reservation._related.tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks for this reservation</p>
              ) : (
                <div className="space-y-2">
                  {reservation._related.tasks.map((task) => (
                    <Link
                      key={task.id}
                      to={`/tasks?id=${task.id}`}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {task.type.replace('_', ' ')}
                        </p>
                        <p className="text-sm text-muted-foreground truncate max-w-md">
                          {task.description}
                        </p>
                      </div>
                      <Badge variant={taskStatusVariants[task.status]} className="capitalize">
                        {task.status.replace('_', ' ')}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Guest Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4" />
                Guest
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reservation.guest ? (
                <div className="space-y-4">
                  <div>
                    <Link
                      to={`/guests/${reservation.guest.id}`}
                      className="text-lg font-semibold hover:text-primary"
                    >
                      {reservation.guest.firstName} {reservation.guest.lastName}
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      {reservation.guest.vipStatus && (
                        <Badge variant="warning">VIP</Badge>
                      )}
                      {reservation.guest.loyaltyTier && (
                        <Badge variant="secondary">{reservation.guest.loyaltyTier}</Badge>
                      )}
                    </div>
                  </div>

                  {reservation.guest.email && (
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <a
                        href={`mailto:${reservation.guest.email}`}
                        className="text-sm hover:text-primary"
                      >
                        {reservation.guest.email}
                      </a>
                    </div>
                  )}

                  {reservation.guest.phone && (
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <a
                        href={`tel:${reservation.guest.phone}`}
                        className="text-sm hover:text-primary"
                      >
                        {reservation.guest.phone}
                      </a>
                    </div>
                  )}

                  {reservation.guest.preferences && reservation.guest.preferences.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Preferences</p>
                      <div className="flex flex-wrap gap-1">
                        {reservation.guest.preferences.map((pref, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {pref}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <Link
                    to={`/guests/${reservation.guest.id}`}
                    className="block text-sm text-primary hover:underline"
                  >
                    View full profile →
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Guest information not available</p>
              )}
            </CardContent>
          </Card>

          {/* Booking Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Booking Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <InfoRow label="Confirmation #" value={reservation.confirmationNumber} />
              <InfoRow
                label="Booked On"
                value={formatDate(reservation.createdAt)}
              />
              <InfoRow label="Source" value={reservation.source} />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
