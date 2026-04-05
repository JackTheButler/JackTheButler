import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageContainer, EmptyState } from '@/components';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Tabs } from '@/components/ui/tabs';
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
  Brain,
  Plus,
  Trash2,
  X,
  Heart,
  Repeat,
  Star,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDate, formatCurrency } from '@/lib/formatters';
import {
  reservationStatusVariants,
  conversationStateVariants,
} from '@/lib/config';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';
import type { GuestWithCounts, ReservationSummary, Conversation, GuestMemory } from '@/types/api';

const VIP_OPTIONS = ['none', 'silver', 'gold', 'platinum', 'diamond'];
const LOYALTY_OPTIONS = ['none', 'member', 'silver', 'gold', 'platinum'];

const MEMORY_CATEGORIES = ['preference', 'complaint', 'habit', 'personal', 'request'] as const;

interface MemoryCategoryConfig {
  icon: LucideIcon;
  borderColor: string;
  bgColor: string;
  iconColor: string;
  labelColor: string;
}

const memoryCategoryConfig: Record<GuestMemory['category'], MemoryCategoryConfig> = {
  preference: {
    icon: Heart,
    borderColor: 'border-l-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    iconColor: 'text-blue-500',
    labelColor: 'text-blue-700 dark:text-blue-400',
  },
  habit: {
    icon: Repeat,
    borderColor: 'border-l-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    iconColor: 'text-purple-500',
    labelColor: 'text-purple-700 dark:text-purple-400',
  },
  complaint: {
    icon: AlertCircle,
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50 dark:bg-red-950/20',
    iconColor: 'text-red-500',
    labelColor: 'text-red-700 dark:text-red-400',
  },
  personal: {
    icon: User,
    borderColor: 'border-l-green-500',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    iconColor: 'text-green-500',
    labelColor: 'text-green-700 dark:text-green-400',
  },
  request: {
    icon: Star,
    borderColor: 'border-l-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    iconColor: 'text-amber-500',
    labelColor: 'text-amber-700 dark:text-amber-400',
  },
};

export function GuestProfilePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canManageGuests = can(PERMISSIONS.GUESTS_MANAGE);
  const [guest, setGuest] = useState<GuestWithCounts | null>(null);
  const [reservations, setReservations] = useState<ReservationSummary[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [memories, setMemories] = useState<GuestMemory[]>([]);
  const [addingMemory, setAddingMemory] = useState(false);
  const [newMemory, setNewMemory] = useState({ category: 'preference' as GuestMemory['category'], content: '' });
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editMemory, setEditMemory] = useState({ category: 'preference' as GuestMemory['category'], content: '' });
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memoryToDelete, setMemoryToDelete] = useState<GuestMemory | null>(null);
  const [deletingMemory, setDeletingMemory] = useState(false);
  const [savingMemory, setSavingMemory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'reservations' | 'conversations'>('overview');

  const memoryCategoryLabels: Record<GuestMemory['category'], string> = {
    preference: t('guestProfile.categoryPreference'),
    complaint: t('guestProfile.categoryComplaint'),
    habit: t('guestProfile.categoryHabit'),
    personal: t('guestProfile.categoryPersonal'),
    request: t('guestProfile.categoryRequest'),
  };

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
      setError(err instanceof Error ? err.message : t('guestProfile.failedToLoad'));
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

  const fetchMemories = async () => {
    if (!id) return;
    try {
      const data = await api.get<{ memories: GuestMemory[] }>(`/guests/${id}/memories`);
      setMemories(data.memories);
    } catch (err) {
      // Non-critical
    }
  };

  const handleAddMemory = async () => {
    if (!id || !newMemory.content.trim()) return;
    setMemoryError(null);
    setSavingMemory(true);
    try {
      await api.post(`/guests/${id}/memories`, newMemory);
      await fetchMemories();
      setAddingMemory(false);
      setNewMemory({ category: 'preference', content: '' });
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : t('guestProfile.failedToSaveMemory'));
    } finally {
      setSavingMemory(false);
    }
  };

  const handleEditMemory = async (memoryId: string) => {
    if (!id || !editMemory.content.trim()) return;
    setMemoryError(null);
    setSavingMemory(true);
    try {
      await api.patch(`/guests/${id}/memories/${memoryId}`, editMemory);
      await fetchMemories();
      setEditingMemoryId(null);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : t('guestProfile.failedToSaveMemory'));
    } finally {
      setSavingMemory(false);
    }
  };

  const handleDeleteMemory = (memory: GuestMemory) => {
    setMemoryToDelete(memory);
  };

  const confirmDeleteMemory = async () => {
    if (!id || !memoryToDelete) return;
    setDeletingMemory(true);
    setMemoryError(null);
    try {
      await api.delete(`/guests/${id}/memories/${memoryToDelete.id}`);
      await fetchMemories();
      setMemoryToDelete(null);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : t('guestProfile.failedToDeleteMemory'));
      setMemoryToDelete(null);
    } finally {
      setDeletingMemory(false);
    }
  };

  useEffect(() => {
    fetchGuest();
    fetchReservations();
    fetchConversations();
    fetchMemories();
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
      setError(err instanceof Error ? err.message : t('guestProfile.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="py-12 text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">{t('guestProfile.loadingGuest')}</p>
        </div>
      </PageContainer>
    );
  }

  if (!guest) {
    return (
      <PageContainer>
        <EmptyState
          icon={AlertCircle}
          title={t('guestProfile.guestNotFound')}
          description={t('guestProfile.guestNotFoundDesc')}
        >
          <Button variant="outline" onClick={() => navigate('/guests')}>
            {t('guestProfile.backToGuests')}
          </Button>
        </EmptyState>
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
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
        {t('guestProfile.backToGuests')}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <User className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">
                {guest.firstName} {guest.lastName}
              </h1>
              {guest.vipStatus && guest.vipStatus !== 'none' && (
                <Badge variant="gold">
                  <Crown className="w-3 h-3 me-1" />
                  {guest.vipStatus.toUpperCase()}
                </Badge>
              )}
              {guest.loyaltyTier && guest.loyaltyTier !== 'none' && (
                <Badge variant="outline">{guest.loyaltyTier}</Badge>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
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
        {canManageGuests && (
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Spinner size="sm" className="me-2" /> : <Save className="w-4 h-4 me-2" />}
                  {t('common.save')}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="w-4 h-4 me-2" />
                {t('common.edit')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'overview', label: t('guestProfile.overview'), icon: User },
          { id: 'reservations', label: `${t('nav.reservations')} (${guest._counts.reservations})`, icon: Hotel },
          { id: 'conversations', label: `${t('reservationDetail.conversations')} (${guest._counts.conversations})`, icon: MessageSquare },
        ]}
        value={activeTab}
        onChange={setActiveTab}
        className="mb-6"
      />

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('guestProfile.stayStatistics')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Hotel className="w-4 h-4" />
                  {t('guestProfile.totalStays')}
                </span>
                <span className="font-semibold">{guest.stayCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  {t('guestProfile.totalRevenue')}
                </span>
                <span className="font-semibold">{formatCurrency(guest.totalRevenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {t('guestProfile.lastStay')}
                </span>
                <span className="font-semibold">{formatDate(guest.lastStayDate)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('guestProfile.preferences')}</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea
                  value={formData.preferences}
                  onChange={(e) => setFormData({ ...formData, preferences: e.target.value })}
                  placeholder={t('guestProfile.preferencesPlaceholder')}
                  className="min-h-[120px]"
                />
              ) : guest.preferences.length > 0 ? (
                <ul className="space-y-2">
                  {guest.preferences.map((pref: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-muted-foreground/70">•</span>
                      {pref}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground/70">{t('guestProfile.noPreferences')}</p>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('guestProfile.notes')}</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={t('guestProfile.notesPlaceholder')}
                  className="min-h-[120px]"
                />
              ) : guest.notes ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{guest.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground/70">{t('guestProfile.noNotes')}</p>
              )}
            </CardContent>
          </Card>

          {/* Edit Form - Additional Fields */}
          {editing && (
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">{t('guestProfile.editDetails')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium">{t('guestProfile.firstName')}</label>
                    <Input
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('guestProfile.lastName')}</label>
                    <Input
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('guestProfile.email')}</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('guestProfile.phone')}</label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('guestProfile.vipStatus')}</label>
                    <select
                      value={formData.vipStatus}
                      onChange={(e) => setFormData({ ...formData, vipStatus: e.target.value })}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    >
                      {VIP_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === 'none' ? t('common.none') : opt.charAt(0).toUpperCase() + opt.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('guestProfile.loyaltyTier')}</label>
                    <select
                      value={formData.loyaltyTier}
                      onChange={(e) => setFormData({ ...formData, loyaltyTier: e.target.value })}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    >
                      {LOYALTY_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === 'none' ? t('common.none') : opt.charAt(0).toUpperCase() + opt.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="text-sm font-medium">{t('guestProfile.tagsHint')}</label>
                    <Input
                      value={formData.tags}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      placeholder={t('guestProfile.tagsPlaceholder')}
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
                <CardTitle className="text-base">{t('guestProfile.tags')}</CardTitle>
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

          {/* What Jack Knows */}
          {(memories.length > 0 || canManageGuests) && (
            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  {t('guestProfile.whatJackKnows')}
                  {memories.length > 0 && (
                    <span className="text-xs font-normal text-muted-foreground">({memories.length})</span>
                  )}
                </CardTitle>
                {canManageGuests && !addingMemory && (
                  <Button variant="outline" size="sm" onClick={() => { setAddingMemory(true); setEditingMemoryId(null); }}>
                    <Plus className="w-3 h-3 me-1" />
                    {t('guestProfile.addMemory')}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {memoryError && (
                  <Alert variant="destructive" className="mb-4" onDismiss={() => setMemoryError(null)}>
                    <AlertDescription>{memoryError}</AlertDescription>
                  </Alert>
                )}

                {/* Empty state */}
                {memories.length === 0 && !addingMemory && (
                  <p className="text-sm text-muted-foreground/70">{t('guestProfile.noMemories')}</p>
                )}

                {/* Memory cards grid */}
                {(addingMemory || memories.length > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Add new memory card */}
                    {addingMemory && (
                      <div className={`rounded-lg border border-l-4 p-3 ${memoryCategoryConfig[newMemory.category].borderColor} ${memoryCategoryConfig[newMemory.category].bgColor}`}>
                        <div className="flex flex-col gap-2">
                          <Select
                            value={newMemory.category}
                            onValueChange={(value) => setNewMemory({ ...newMemory, category: value as GuestMemory['category'] })}
                          >
                            <SelectTrigger className="h-8 text-xs w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MEMORY_CATEGORIES.map((cat) => (
                                <SelectItem key={cat} value={cat} className="text-xs">{memoryCategoryLabels[cat]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Textarea
                            value={newMemory.content}
                            onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
                            placeholder={t('guestProfile.memoryContentPlaceholder')}
                            className="min-h-[80px] text-sm resize-none"
                            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAddMemory(); if (e.key === 'Escape') { setAddingMemory(false); setNewMemory({ category: 'preference', content: '' }); } }}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleAddMemory} disabled={!newMemory.content.trim() || savingMemory}>
                              {savingMemory ? <Spinner size="sm" /> : t('guestProfile.saveMemory')}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setAddingMemory(false); setNewMemory({ category: 'preference', content: '' }); }}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                    {memories.map((memory) => {
                      const config = memoryCategoryConfig[memory.category];
                      const CategoryIcon = config.icon;
                      const isEditing = editingMemoryId === memory.id;

                      const editConfig = isEditing ? memoryCategoryConfig[editMemory.category] : config;

                      return (
                        <div
                          key={memory.id}
                          className={`group relative rounded-lg border border-l-4 p-3 transition-shadow hover:shadow-sm ${editConfig.borderColor} ${editConfig.bgColor}`}
                        >
                          {isEditing ? (
                            /* Inline edit mode */
                            <div className="flex flex-col gap-2">
                              <Select
                                value={editMemory.category}
                                onValueChange={(value) => setEditMemory({ ...editMemory, category: value as GuestMemory['category'] })}
                              >
                                <SelectTrigger className="h-8 text-xs w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {MEMORY_CATEGORIES.map((cat) => (
                                    <SelectItem key={cat} value={cat} className="text-xs">{memoryCategoryLabels[cat]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Textarea
                                value={editMemory.content}
                                onChange={(e) => setEditMemory({ ...editMemory, content: e.target.value })}
                                className="w-full min-h-[80px] text-sm resize-none"
                                onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleEditMemory(memory.id); if (e.key === 'Escape') setEditingMemoryId(null); }}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => handleEditMemory(memory.id)} disabled={!editMemory.content.trim() || savingMemory}>
                                  {savingMemory ? <Spinner size="sm" /> : t('guestProfile.saveMemory')}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingMemoryId(null)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            /* Display mode */
                            <>
                              {/* Card header: icon + category label + actions */}
                              <div className="flex items-center justify-between mb-2">
                                <div className={`flex items-center gap-1.5 text-xs font-medium ${config.labelColor}`}>
                                  <CategoryIcon className={`w-3.5 h-3.5 ${config.iconColor}`} />
                                  {memoryCategoryLabels[memory.category]}
                                </div>
                                {canManageGuests && (
                                  <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => { setEditingMemoryId(memory.id); setEditMemory({ category: memory.category, content: memory.content }); setAddingMemory(false); setNewMemory({ category: 'preference', content: '' }); }}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                      onClick={() => handleDeleteMemory(memory)}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {/* Memory content */}
                              <p className="text-sm text-foreground leading-snug mb-3">
                                {memory.content}
                              </p>

                              {/* Card footer: source + date */}
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="font-medium">
                                  {memory.source === 'ai_extracted' && memory.conversationId ? (
                                    <Link to={`/inbox/${memory.conversationId}`} className="hover:underline">
                                      AI
                                    </Link>
                                  ) : memory.source === 'ai_extracted' ? (
                                    'AI'
                                  ) : memory.source === 'manual' ? (
                                    'Staff'
                                  ) : (
                                    'PMS'
                                  )}
                                </span>
                                <span>·</span>
                                <span>{formatDate(memory.lastReinforcedAt)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'reservations' && (
        <Card>
          <CardContent className="pt-6">
            {reservations.length === 0 ? (
              <EmptyState
                icon={Hotel}
                title={t('guestProfile.noReservations')}
                description={t('guestProfile.noReservationsDesc')}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('guestProfile.confirmation')}</TableHead>
                    <TableHead>{t('common.room')}</TableHead>
                    <TableHead>{t('reservations.arrival')}</TableHead>
                    <TableHead>{t('reservations.departure')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservations.map((res) => (
                    <TableRow key={res.id}>
                      <TableCell className="font-medium">{res.confirmationNumber}</TableCell>
                      <TableCell>
                        {res.roomNumber ? (
                          <span>
                            {res.roomNumber} <span className="text-muted-foreground/70">({res.roomType})</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/70">{res.roomType}</span>
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
              <EmptyState
                icon={MessageSquare}
                title={t('guestProfile.noConversations')}
                description={t('guestProfile.noConversationsDesc')}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('guestProfile.channel')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('guestProfile.lastMessage')}</TableHead>
                    <TableHead>{t('common.created')}</TableHead>
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
                            {t('guestProfile.view')}
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
      <ConfirmDialog
        open={!!memoryToDelete}
        onOpenChange={(open) => { if (!open) setMemoryToDelete(null); }}
        title={t('guestProfile.deleteMemoryTitle')}
        description={t('guestProfile.deleteMemoryDescription')}
        confirmLabel={t('guestProfile.deleteMemoryConfirm')}
        variant="destructive"
        onConfirm={confirmDeleteMemory}
        loading={deletingMemory}
      />
    </PageContainer>
  );
}
