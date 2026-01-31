import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PageContainer } from '@/components';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2, AlertCircle, X, Save } from 'lucide-react';
import { api } from '@/lib/api';

const VIP_OPTIONS = ['none', 'silver', 'gold', 'platinum', 'diamond'];
const LOYALTY_OPTIONS = ['none', 'member', 'silver', 'gold', 'platinum'];

export function GuestFormPage() {
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
      setError('First name and last name are required');
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
      setError(err instanceof Error ? err.message : 'Failed to create guest');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}

      {/* Back Button */}
      <Link
        to="/guests"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Guests
      </Link>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Add New Guest</CardTitle>
          <CardDescription>Create a new guest profile</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">
                First Name <span className="text-red-500">*</span>
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
                Last Name <span className="text-red-500">*</span>
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
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@example.com"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
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
              <label className="text-sm font-medium">Language</label>
              <select
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="zh">Chinese</option>
                <option value="ja">Japanese</option>
              </select>
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
          </div>

          {/* Preferences */}
          <div>
            <label className="text-sm font-medium">Preferences</label>
            <p className="text-xs text-gray-500 mb-1">Enter one preference per line</p>
            <Textarea
              value={formData.preferences}
              onChange={(e) => setFormData({ ...formData, preferences: e.target.value })}
              placeholder="High floor preferred&#10;Feather pillows&#10;Late checkout when available"
              className="mt-1 min-h-[100px]"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium">Tags</label>
            <p className="text-xs text-gray-500 mb-1">Comma-separated</p>
            <Input
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="business, frequent, noise-sensitive"
              className="mt-1"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this guest..."
              className="mt-1 min-h-[80px]"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => navigate('/guests')}>
              Cancel
            </Button>
            <Button className="bg-gray-900 hover:bg-gray-800" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Save className="w-4 h-4 mr-2" />
              Create Guest
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
