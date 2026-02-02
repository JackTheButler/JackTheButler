import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PageContainer } from '@/components';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Pencil,
  Save,
  Crown,
  Mail,
  Phone,
  Globe,
  Calendar,
  DollarSign,
  MessageSquare,
  Hotel,
  User,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/formatters';
import {
  reservationStatusVariants,
  conversationStateVariants,
} from '@/lib/config';
import type { GuestWithCounts, ReservationSummary, Conversation } from '@/types/api';

const VIP_OPTIONS = ['none', 'silver', 'gold', 'platinum', 'diamond'];
const LOYALTY_OPTIONS = ['none', 'member', 'silver', 'gold', 'platinum'];

export function GuestProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [guest, setGuest] = useState<GuestWithCounts | null>(null);
  const [reservations, setReservations] = useState<ReservationSummary[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'reservations' | 'conversations'>('overview');

  // Edit form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    language: 'en',
    vipStatus: 'none',
    loyaltyTier: 'none',
    preferences: '',
    tags: '',
    notes: '',
  });

  const fetchGuest = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await api.get<GuestWithCounts>(`/guests/${id}`);
      setGuest(data);
      setFormData({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || '',
        phone: data.phone || '',
        language: data.language,
        vipStatus: data.vipStatus || 'none',
        loyaltyTier: data.loyaltyTier || 'none',
        preferences: data.preferences.join('\n'),
        tags: data.tags.join(', '),
        notes: data.notes || '',
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load guest');
    } finally {
      setLoading(false);
    }
  };

  const fetchReservations = async () => {
    if (!id) return;
    try {
      const data = await api.get<{ reservations: ReservationSummary[] }>(`/guests/${id}/reservations`);
      setReservations(data.reservations);
    } catch (err) {
      // Non-critical
    }
  };

  const fetchConversations = async () => {
    if (!id) return;
    try {
      const data = await api.get<{ conversations: Conversation[] }>(`/guests/${id}/conversations`);
      setConversations(data.conversations);
    } catch (err) {
      // Non-critical
    }
  };

  useEffect(() => {
    fetchGuest();
    fetchReservations();
    fetchConversations();
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);

    try {
      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email || null,
        phone: formData.phone || null,
        language: formData.language,
        vipStatus: formData.vipStatus === 'none' ? null : formData.vipStatus,
        loyaltyTier: formData.loyaltyTier === 'none' ? null : formData.loyaltyTier,
        preferences: formData.preferences.split('\n').map(p => p.trim()).filter(Boolean),
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        notes: formData.notes || null,
      };

      await api.put(`/guests/${id}`, payload);
      await fetchGuest();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save guest');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="py-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-sm text-gray-500">Loading guest...</p>
        </div>
      </PageContainer>
    );
  }

  if (!guest) {
    return (
      <PageContainer>
        <div className="py-12 text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">Guest not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/guests')}>
            Back to Guests
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {error && (
        <Alert variant="destructive" className="mb-6" onDismiss={() => setError(null)}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Back Button */}
      <Link
        to="/guests"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Guests
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">
                {guest.firstName} {guest.lastName}
              </h1>
              {guest.vipStatus && guest.vipStatus !== 'none' && (
                <Badge className="bg-yellow-100 text-yellow-800">
                  <Crown className="w-3 h-3 mr-1" />
                  {guest.vipStatus.toUpperCase()}
                </Badge>
              )}
              {guest.loyaltyTier && guest.loyaltyTier !== 'none' && (
                <Badge variant="outline">{guest.loyaltyTier}</Badge>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              {guest.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {guest.email}
                </span>
              )}
              {guest.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  {guest.phone}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Globe className="w-4 h-4" />
                {guest.language.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button  onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <nav className="flex gap-6">
          {[
            { id: 'overview', label: 'Overview', icon: User },
            { id: 'reservations', label: `Reservations (${guest._counts.reservations})`, icon: Hotel },
            { id: 'conversations', label: `Conversations (${guest._counts.conversations})`, icon: MessageSquare },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 pb-3 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stay Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <Hotel className="w-4 h-4" />
                  Total Stays
                </span>
                <span className="font-semibold">{guest.stayCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Total Revenue
                </span>
                <span className="font-semibold">{formatCurrency(guest.totalRevenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Last Stay
                </span>
                <span className="font-semibold">{formatDate(guest.lastStayDate)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preferences</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea
                  value={formData.preferences}
                  onChange={(e) => setFormData({ ...formData, preferences: e.target.value })}
                  placeholder="Enter preferences (one per line)"
                  className="min-h-[120px]"
                />
              ) : guest.preferences.length > 0 ? (
                <ul className="space-y-2">
                  {guest.preferences.map((pref: string, i: number) => (
                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="text-gray-400">•</span>
                      {pref}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">No preferences recorded</p>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add notes about this guest..."
                  className="min-h-[120px]"
                />
              ) : guest.notes ? (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{guest.notes}</p>
              ) : (
                <p className="text-sm text-gray-400">No notes</p>
              )}
            </CardContent>
          </Card>

          {/* Edit Form - Additional Fields */}
          {editing && (
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Edit Guest Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium">First Name</label>
                    <Input
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Last Name</label>
                    <Input
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">VIP Status</label>
                    <select
                      value={formData.vipStatus}
                      onChange={(e) => setFormData({ ...formData, vipStatus: e.target.value })}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    >
                      {VIP_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === 'none' ? 'None' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Loyalty Tier</label>
                    <select
                      value={formData.loyaltyTier}
                      onChange={(e) => setFormData({ ...formData, loyaltyTier: e.target.value })}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    >
                      {LOYALTY_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === 'none' ? 'None' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="text-sm font-medium">Tags (comma-separated)</label>
                    <Input
                      value={formData.tags}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      placeholder="business, frequent, noise-sensitive"
                      className="mt-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {!editing && guest.tags.length > 0 && (
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {guest.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'reservations' && (
        <Card>
          <CardContent className="pt-6">
            {reservations.length === 0 ? (
              <div className="py-8 text-center">
                <Hotel className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500">No reservations found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Confirmation #</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Arrival</TableHead>
                    <TableHead>Departure</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservations.map((res) => (
                    <TableRow key={res.id}>
                      <TableCell className="font-medium">{res.confirmationNumber}</TableCell>
                      <TableCell>
                        {res.roomNumber ? (
                          <span>
                            {res.roomNumber} <span className="text-gray-400">({res.roomType})</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">{res.roomType}</span>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(res.arrivalDate)}</TableCell>
                      <TableCell>{formatDate(res.departureDate)}</TableCell>
                      <TableCell>
                        <Badge variant={reservationStatusVariants[res.status]} className="capitalize">
                          {res.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'conversations' && (
        <Card>
          <CardContent className="pt-6">
            {conversations.length === 0 ? (
              <div className="py-8 text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500">No conversations found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Message</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conversations.map((conv) => (
                    <TableRow key={conv.id}>
                      <TableCell className="capitalize">{conv.channelType}</TableCell>
                      <TableCell>
                        <Badge variant={conversationStateVariants[conv.state]}>
                          {conv.state}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(conv.lastMessageAt)}</TableCell>
                      <TableCell>{formatDate(conv.createdAt)}</TableCell>
                      <TableCell>
                        <Link to={`/inbox/${conv.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
