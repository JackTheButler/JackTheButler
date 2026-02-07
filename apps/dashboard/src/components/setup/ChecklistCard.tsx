import { useTranslation } from 'react-i18next';
import { Check, X, Globe, MessageSquare, ArrowRight, Clock, Phone, Mail, MapPin, Building } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ChecklistItem {
  id: string;
  label: string;
  found: boolean;
  count?: number;
  required: boolean;
}

export interface ProfileData {
  name?: string;
  checkInTime?: string;
  checkOutTime?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
}

export interface ChecklistCardProps {
  items: ChecklistItem[];
  profile?: ProfileData;
  onTryAnotherUrl: () => void;
  onTellManually: () => void;
  onContinue: () => void;
  canContinue: boolean;
  disabled?: boolean;
}

export function ChecklistCard({
  items,
  profile,
  onTryAnotherUrl,
  onTellManually,
  onContinue,
  canContinue,
  disabled,
}: ChecklistCardProps) {
  const { t } = useTranslation('setup');

  const requiredItems = items.filter((item) => item.required);
  const optionalItems = items.filter((item) => !item.required);

  // Check if we have any profile data to show
  const hasProfileData = profile && (
    profile.name ||
    profile.checkInTime ||
    profile.checkOutTime ||
    profile.contactPhone ||
    profile.contactEmail ||
    profile.address
  );

  return (
    <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-md">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="font-semibold text-foreground">{t('knowledge.checklist.title')}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t('knowledge.checklist.description')}
        </p>
      </div>

      {/* Profile Data */}
      {hasProfileData && (
        <div className="px-4 py-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {t('knowledge.checklist.extracted')}
          </p>
          <div className="space-y-1.5 text-sm">
            {profile.name && (
              <div className="flex items-center gap-2 text-foreground">
                <Building className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="font-medium">{profile.name}</span>
              </div>
            )}
            {(profile.checkInTime || profile.checkOutTime) && (
              <div className="flex items-center gap-2 text-foreground">
                <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span>
                  {profile.checkInTime && `Check-in: ${profile.checkInTime}`}
                  {profile.checkInTime && profile.checkOutTime && ' · '}
                  {profile.checkOutTime && `Check-out: ${profile.checkOutTime}`}
                </span>
              </div>
            )}
            {profile.contactPhone && (
              <div className="flex items-center gap-2 text-foreground">
                <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span>{profile.contactPhone}</span>
              </div>
            )}
            {profile.contactEmail && (
              <div className="flex items-center gap-2 text-foreground">
                <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{profile.contactEmail}</span>
              </div>
            )}
            {profile.address && (
              <div className="flex items-start gap-2 text-foreground">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <span className="line-clamp-2">{profile.address}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Required items */}
      <div className="px-4 py-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          {t('knowledge.checklist.required')}
        </p>
        <div className="space-y-1.5">
          {requiredItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex items-center gap-2 py-1.5',
                item.found ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {item.found ? (
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
              ) : (
                <X className="w-4 h-4 text-destructive flex-shrink-0" />
              )}
              <span className="text-sm flex-1">{item.label}</span>
              {item.found && item.count && item.count > 1 && (
                <span className="text-xs text-muted-foreground">({item.count})</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Optional items */}
      {optionalItems.length > 0 && (
        <div className="px-4 py-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {t('knowledge.checklist.optional')}
          </p>
          <div className="space-y-1.5">
            {optionalItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-center gap-2 py-1.5',
                  item.found ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {item.found ? (
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="text-sm flex-1">{item.label}</span>
                {item.found && item.count && item.count > 0 && (
                  <span className="text-xs text-muted-foreground">({item.count})</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 pt-3 pb-4 border-t border-border/50">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTryAnotherUrl}
            disabled={disabled}
            className="flex-1 sm:flex-initial"
          >
            <Globe className="w-3.5 h-3.5 mr-1.5" />
            {t('knowledge.checklist.tryAnotherUrl')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTellManually}
            disabled={disabled}
            className="flex-1 sm:flex-initial"
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            {t('knowledge.checklist.tellMe')}
          </Button>
        </div>
        {canContinue && (
          <Button
            type="button"
            size="sm"
            onClick={onContinue}
            disabled={disabled}
            className="w-full mt-3"
          >
            {t('knowledge.checklist.continue')}
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
