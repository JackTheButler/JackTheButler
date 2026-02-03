import { Input } from '@/components/ui/input';

const VIP_OPTIONS = ['none', 'silver', 'gold', 'platinum', 'diamond'];
const LOYALTY_OPTIONS = ['none', 'member', 'silver', 'gold', 'platinum'];
const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
];

export interface GuestFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  language: string;
  vipStatus: string;
  loyaltyTier: string;
  tags?: string;
}

interface GuestFormFieldsProps {
  formData: GuestFormData;
  onChange: (data: GuestFormData) => void;
  /** Show required indicators on name fields */
  showRequired?: boolean;
  /** Show language field */
  showLanguage?: boolean;
  /** Show tags field */
  showTags?: boolean;
  /** Grid columns for responsive layout */
  columns?: 2 | 3;
}

function capitalize(str: string): string {
  return str === 'none' ? 'None' : str.charAt(0).toUpperCase() + str.slice(1);
}

export function GuestFormFields({
  formData,
  onChange,
  showRequired = false,
  showLanguage = false,
  showTags = false,
  columns = 2,
}: GuestFormFieldsProps) {
  const gridClass = columns === 3
    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
    : 'grid grid-cols-1 md:grid-cols-2 gap-4';

  const update = (field: keyof GuestFormData, value: string) => {
    onChange({ ...formData, [field]: value });
  };

  return (
    <div className="space-y-4">
      {/* Name Fields */}
      <div className={gridClass}>
        <div>
          <label className="text-sm font-medium">
            First Name {showRequired && <span className="text-red-500">*</span>}
          </label>
          <Input
            value={formData.firstName}
            onChange={(e) => update('firstName', e.target.value)}
            placeholder="John"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">
            Last Name {showRequired && <span className="text-red-500">*</span>}
          </label>
          <Input
            value={formData.lastName}
            onChange={(e) => update('lastName', e.target.value)}
            placeholder="Smith"
            className="mt-1"
          />
        </div>
      </div>

      {/* Contact Fields */}
      <div className={gridClass}>
        <div>
          <label className="text-sm font-medium">Email</label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="john@example.com"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Phone</label>
          <Input
            value={formData.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="+1 555-123-4567"
            className="mt-1"
          />
        </div>
      </div>

      {/* Status Fields */}
      <div className={columns === 3 ? 'grid grid-cols-1 md:grid-cols-3 gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        {showLanguage && (
          <div>
            <label className="text-sm font-medium">Language</label>
            <select
              value={formData.language}
              onChange={(e) => update('language', e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="text-sm font-medium">VIP Status</label>
          <select
            value={formData.vipStatus}
            onChange={(e) => update('vipStatus', e.target.value)}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
          >
            {VIP_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {capitalize(opt)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Loyalty Tier</label>
          <select
            value={formData.loyaltyTier}
            onChange={(e) => update('loyaltyTier', e.target.value)}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
          >
            {LOYALTY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {capitalize(opt)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tags Field */}
      {showTags && formData.tags !== undefined && (
        <div>
          <label className="text-sm font-medium">Tags (comma-separated)</label>
          <Input
            value={formData.tags}
            onChange={(e) => update('tags', e.target.value)}
            placeholder="business, frequent, noise-sensitive"
            className="mt-1"
          />
        </div>
      )}
    </div>
  );
}
