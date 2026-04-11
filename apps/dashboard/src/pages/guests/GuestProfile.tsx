import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageContainer, EmptyState, DetailHeader } from '@/components';
import { usePageActions } from '@/contexts/PageActionsContext';
import { DataTable, type Column } from '@/components/DataTable';
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
  const location = useLocation();
  const backLabel = (location.state as { fromLabel?: string } | null)?.fromLabel ?? t('guestProfile.backToGuests');
  const { can } = usePermissions();
  const canManageGuests = can(PERMISSIONS.GUESTS_MANAGE);
  const { setActions } = usePageActions();
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
  const [fixingEmbeddingId, setFixingEmbeddingId] = useState<string | null>(null);
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

  const handleFixEmbedding = async (memoryId: string) => {
    if (!id) return;
    setFixingEmbeddingId(memoryId);
    try {
      await api.post(`/guests/${id}/memories/${memoryId}/embed`, {});
      setMemories((prev) => prev.map((m) => m.id === memoryId ? { ...m, hasEmbedding: true } : m));
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : t('guestProfile.failedToFixEmbedding'));
    } finally {
      setFixingEmbeddingId(null);
    }
  };

  useEffect(() => {
    fetchGuest();
    fetchReservations();
    fetchConversations();
    fetchMemories();
  }, [id]);

  const handleSave = useCallback(async () => {
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
  }, [id, formData, t]);

  useEffect(() => {
    if (!canManageGuests) return;
    if (editing) {
      setActions([
        {
          id: 'cancel-edit',
          label: t('common.cancel'),
          variant: 'outline',
          onClick: () => {
            if (guest) {
              setFormData({
                firstName: guest.firstName,
                lastName: guest.lastName,
                email: guest.email || '',
                phone: guest.phone || '',
                language: guest.language,
                vipStatus: guest.vipStatus || 'none',
                loyaltyTier: guest.loyaltyTier || 'none',
                preferences: guest.preferences.join('\n'),
                tags: guest.tags.join(', '),
                notes: guest.notes || '',
              });
            }
            setEditing(false);
          },
        },
        {
          id: 'save-guest',
          label: t('common.save'),
          icon: Save,
          onClick: handleSave,
          loading: saving,
          disabled: saving,
        },
      ]);
    } else {
      setActions([
        {
          id: 'edit-guest',
          label: t('common.edit'),
          icon: Pencil,
          onClick: () => { setEditing(true); setActiveTab('overview'); },
        },
      ]);
    }
    return () => setActions([]);
  }, [setActions, editing, saving, canManageGuests, handleSave, guest, t]);

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

      <DetailHeader
        backTo="/guests"
        backLabel={backLabel}
        icon={<User className="w-8 h-8 text-muted-foreground" />}
        title={
          <span className="flex items-center gap-3 flex-wrap">
            {guest.firstName} {guest.lastName}
            {guest.vipStatus && guest.vipStatus !== 'none' && (
              <Badge variant="gold">
                <Crown className="w-3 h-3 me-1" />
                {guest.vipStatus.toUpperCase()}
              </Badge>
            )}
            {guest.loyaltyTier && guest.loyaltyTier !== 'none' && (
              <Badge variant="outline">{guest.loyaltyTier}</Badge>
            )}
          </span>
        }
        subtitle={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
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
        }
      />

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

                              {/* Card footer: source + date + fix embedding */}
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="font-medium">
                                  {memory.source === 'ai_extracted' && memory.conversationId ? (
                                    <Link to={`/inbox?id=${memory.conversationId}`} className="hover:underline">
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
                                {!memory.hasEmbedding && canManageGuests && (
                                  <>
                                    <span>·</span>
                                    <button
                                      onClick={() => handleFixEmbedding(memory.id)}
                                      disabled={fixingEmbeddingId === memory.id}
                                      className="text-amber-500 hover:text-amber-600 disabled:opacity-50 transition-colors"
                                    >
                                      {t('guestProfile.fixEmbedding')}
                                    </button>
                                  </>
                                )}
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
        <DataTable
          data={reservations}
          keyExtractor={(res) => res.id}
          onRowClick={(res) => navigate(`/reservations/${res.id}`, { state: { fromLabel: t('guestProfile.backToGuest') } })}
          emptyState={<EmptyState icon={Hotel} title={t('guestProfile.noReservations')} description={t('guestProfile.noReservationsDesc')} />}
          columns={[
            {
              key: 'confirmationNumber',
              header: t('guestProfile.confirmation'),
              render: (res) => <span className="text-sm font-medium">{res.confirmationNumber}</span>,
            },
            {
              key: 'room',
              header: t('common.room'),
              render: (res) => res.roomNumber ? (
                <span className="text-sm">{res.roomNumber} <span className="text-muted-foreground">({res.roomType})</span></span>
              ) : (
                <span className="text-sm text-muted-foreground">{res.roomType}</span>
              ),
            },
            {
              key: 'arrivalDate',
              header: t('reservations.arrival'),
              render: (res) => <span className="text-sm text-muted-foreground">{formatDate(res.arrivalDate)}</span>,
            },
            {
              key: 'departureDate',
              header: t('reservations.departure'),
              render: (res) => <span className="text-sm text-muted-foreground">{formatDate(res.departureDate)}</span>,
            },
            {
              key: 'status',
              header: t('common.status'),
              render: (res) => (
                <Badge variant={reservationStatusVariants[res.status]} className="capitalize">
                  {res.status.replace('_', ' ')}
                </Badge>
              ),
            },
          ] as Column<ReservationSummary>[]}
        />
      )}

      {activeTab === 'conversations' && (
        <DataTable
          data={conversations}
          keyExtractor={(conv) => conv.id}
          onRowClick={(conv) => navigate(`/inbox?id=${conv.id}`, { state: { fromLabel: t('conversations.backToChat') } })}
          emptyState={<EmptyState icon={MessageSquare} title={t('guestProfile.noConversations')} description={t('guestProfile.noConversationsDesc')} />}
          columns={[
            {
              key: 'channelType',
              header: t('guestProfile.channel'),
              render: (conv) => <span className="text-sm font-medium capitalize">{conv.channelType}</span>,
            },
            {
              key: 'state',
              header: t('common.status'),
              render: (conv) => (
                <Badge variant={conversationStateVariants[conv.state]}>
                  {conv.state}
                </Badge>
              ),
            },
            {
              key: 'lastMessageAt',
              header: t('guestProfile.lastMessage'),
              render: (conv) => <span className="text-sm text-muted-foreground">{formatDate(conv.lastMessageAt)}</span>,
            },
            {
              key: 'createdAt',
              header: t('common.created'),
              render: (conv) => <span className="text-sm text-muted-foreground">{formatDate(conv.createdAt)}</span>,
            },
          ] as Column<Conversation>[]}
        />
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
