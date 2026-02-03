import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '@/lib/api';

const VIP_OPTIONS = ['none', 'silver', 'gold', 'platinum', 'diamond'];
const LOYALTY_OPTIONS = ['none', 'member', 'silver', 'gold', 'platinum'];

export function GuestFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const handleSave = async () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setError(t('guestForm.firstNameRequired'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email || null,
        phone: formData.phone || null,
        language: formData.language,
        vipStatus: formData.vipStatus === 'none' ? null : formData.vipStatus,
        loyaltyTier: formData.loyaltyTier === 'none' ? null : formData.loyaltyTier,
        preferences: formData.preferences.split('\n').map(p => p.trim()).filter(Boolean),
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        notes: formData.notes || null,
      };

      const guest = await api.post<{ id: string }>('/guests', payload);
      navigate(`/guests/${guest.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('guestForm.failedToCreate'));
    } finally {
      setSaving(false);
    }
  };

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
        <ArrowLeft className="w-4 h-4" />
        {t('guestForm.backToGuests')}
      </Link>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t('guestForm.addNewGuest')}</CardTitle>
          <CardDescription>{t('guestForm.createGuestProfile')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">
                {t('guestForm.firstName')} <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="John"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                {t('guestForm.lastName')} <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Smith"
                className="mt-1"
              />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">{t('guestForm.email')}</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@example.com"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('guestForm.phone')}</label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 555-123-4567"
                className="mt-1"
              />
            </div>
          </div>

          {/* Status */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">{t('guestForm.language')}</label>
              <select
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="zh">中文</option>
                <option value="ja">日本語</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{t('guestForm.vipStatus')}</label>
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
              <label className="text-sm font-medium">{t('guestForm.loyaltyTier')}</label>
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
          </div>

          {/* Preferences */}
          <div>
            <label className="text-sm font-medium">{t('guestForm.preferences')}</label>
            <p className="text-xs text-muted-foreground mb-1">{t('guestForm.preferencesHint')}</p>
            <Textarea
              value={formData.preferences}
              onChange={(e) => setFormData({ ...formData, preferences: e.target.value })}
              placeholder={t('guestForm.preferencesPlaceholder')}
              className="mt-1 min-h-[100px]"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium">{t('guestForm.tags')}</label>
            <p className="text-xs text-muted-foreground mb-1">{t('guestForm.tagsHint')}</p>
            <Input
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder={t('guestForm.tagsPlaceholder')}
              className="mt-1"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium">{t('guestForm.notes')}</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder={t('guestForm.notesPlaceholder')}
              className="mt-1 min-h-[80px]"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => navigate('/guests')}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {t('guestForm.createGuest')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
