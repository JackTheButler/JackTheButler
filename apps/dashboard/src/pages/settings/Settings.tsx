import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Sparkles, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { PageContainer, ActionItems, DemoDataCard } from '@/components';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { TimeSelect } from '@/components/ui/time-select';
import {
  DialogRoot,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface ResetResponse {
  success: boolean;
  tablesCleared?: string[];
  error?: string;
}

interface HotelProfile {
  name: string;
  address?: string;
  city?: string;
  country?: string;
  timezone: string;
  currency: string;
  checkInTime: string;
  checkOutTime: string;
  contactPhone?: string;
  contactEmail?: string;
  website?: string;
}

interface TimezoneOption {
  value: string;
  label: string;
}

interface CurrencyOption {
  value: string;
  label: string;
  symbol: string;
}

interface CountryOption {
  value: string;
  label: string;
}

type SettingsTab = 'hotel-profile' | 'quick-setup' | 'danger-zone';

export function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>('hotel-profile');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetComplete, setResetComplete] = useState(false);

  // Hotel profile form state
  const [profileForm, setProfileForm] = useState<HotelProfile>({
    name: '',
    timezone: 'UTC',
    currency: 'USD',
    checkInTime: '15:00',
    checkOutTime: '11:00',
  });
  const [profileSaved, setProfileSaved] = useState(false);

  // Fetch hotel profile
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['hotel-profile'],
    queryFn: () => api.get<{ profile: HotelProfile; isConfigured: boolean }>('/settings/hotel'),
  });

  // Fetch timezones
  const { data: timezonesData } = useQuery({
    queryKey: ['timezones'],
    queryFn: () => api.get<{ timezones: TimezoneOption[] }>('/settings/hotel/timezones'),
  });

  // Fetch currencies
  const { data: currenciesData } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => api.get<{ currencies: CurrencyOption[] }>('/settings/hotel/currencies'),
  });

  // Fetch countries
  const { data: countriesData } = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get<{ countries: CountryOption[] }>('/settings/hotel/countries'),
  });

  // Update form when data loads
  useEffect(() => {
    if (profileData?.profile) {
      setProfileForm(profileData.profile);
    }
  }, [profileData]);

  // Save hotel profile mutation
  const saveProfileMutation = useMutation({
    mutationFn: (data: HotelProfile) => api.put<{ profile: HotelProfile }>('/settings/hotel', data),
    onSuccess: () => {
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    },
  });

  const handleProfileChange = (field: keyof HotelProfile, value: string) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = () => {
    saveProfileMutation.mutate(profileForm);
  };

  // Reset database mutation
  const resetMutation = useMutation({
    mutationFn: () => api.post<ResetResponse>('/seed/reset', { confirm: 'RESET' }),
    onSuccess: () => {
      setShowConfirmDialog(false);
      setConfirmText('');
      setResetComplete(true);
      localStorage.removeItem('demo-data-loaded');
      localStorage.removeItem('dismissed-cards');
    },
  });

  const handleReset = () => {
    if (confirmText === 'RESET') {
      resetMutation.mutate();
    }
  };

  const isConfirmValid = confirmText === 'RESET';

  const tabs = [
    { id: 'hotel-profile' as const, label: t('settings.hotelProfile.title'), icon: Building2 },
    { id: 'quick-setup' as const, label: t('settings.quickSetup.title'), icon: Sparkles },
    { id: 'danger-zone' as const, label: t('settings.dangerZone.title'), icon: AlertTriangle, variant: 'destructive' },
  ];

  return (
    <PageContainer>
      <div className="flex gap-8">
        {/* Vertical Tab Navigation */}
        <nav className="w-48 flex-shrink-0">
          <ul className="space-y-1">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors text-start',
                    activeTab === tab.id
                      ? tab.variant === 'destructive'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Tab Content */}
        <div className="flex-1 min-w-0">
          {/* Hotel Profile Tab */}
          {activeTab === 'hotel-profile' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">{t('settings.hotelProfile.title')}</h2>
                <p className="text-sm text-muted-foreground">{t('settings.hotelProfile.description')}</p>
              </div>

              {profileLoading ? (
                <div className="space-y-4">
                  <div className="h-10 bg-muted animate-pulse rounded" />
                  <div className="h-10 bg-muted animate-pulse rounded" />
                  <div className="h-10 bg-muted animate-pulse rounded" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground">{t('settings.hotelProfile.basicInfo')}</h3>

                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">{t('settings.hotelProfile.hotelName')} *</Label>
                        <Input
                          id="name"
                          value={profileForm.name}
                          onChange={(e) => handleProfileChange('name', e.target.value)}
                          placeholder={t('settings.hotelProfile.hotelNamePlaceholder')}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="address">{t('settings.hotelProfile.address')}</Label>
                        <Input
                          id="address"
                          value={profileForm.address || ''}
                          onChange={(e) => handleProfileChange('address', e.target.value)}
                          placeholder={t('settings.hotelProfile.addressPlaceholder')}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="city">{t('settings.hotelProfile.city')}</Label>
                          <Input
                            id="city"
                            value={profileForm.city || ''}
                            onChange={(e) => handleProfileChange('city', e.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>{t('settings.hotelProfile.country')}</Label>
                          <Combobox
                            options={countriesData?.countries || []}
                            value={profileForm.country || ''}
                            onValueChange={(value) => handleProfileChange('country', value)}
                            placeholder={t('settings.hotelProfile.selectCountry')}
                            searchPlaceholder={t('settings.hotelProfile.searchCountry')}
                            emptyText={t('settings.hotelProfile.noCountryFound')}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Regional Settings */}
                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="text-sm font-medium text-muted-foreground">{t('settings.hotelProfile.regionalSettings')}</h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>{t('settings.hotelProfile.timezone')} *</Label>
                        <Combobox
                          options={timezonesData?.timezones || []}
                          value={profileForm.timezone}
                          onValueChange={(value) => handleProfileChange('timezone', value)}
                          placeholder={t('settings.hotelProfile.selectTimezone')}
                          searchPlaceholder={t('settings.hotelProfile.searchTimezone')}
                          emptyText={t('settings.hotelProfile.noTimezoneFound')}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>{t('settings.hotelProfile.currency')} *</Label>
                        <Combobox
                          options={currenciesData?.currencies || []}
                          value={profileForm.currency}
                          onValueChange={(value) => handleProfileChange('currency', value)}
                          placeholder={t('settings.hotelProfile.selectCurrency')}
                          searchPlaceholder={t('settings.hotelProfile.searchCurrency')}
                          emptyText={t('settings.hotelProfile.noCurrencyFound')}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>{t('settings.hotelProfile.checkInTime')}</Label>
                        <TimeSelect
                          value={profileForm.checkInTime}
                          onValueChange={(value) => handleProfileChange('checkInTime', value)}
                          placeholder={t('settings.hotelProfile.selectTime')}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>{t('settings.hotelProfile.checkOutTime')}</Label>
                        <TimeSelect
                          value={profileForm.checkOutTime}
                          onValueChange={(value) => handleProfileChange('checkOutTime', value)}
                          placeholder={t('settings.hotelProfile.selectTime')}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="text-sm font-medium text-muted-foreground">{t('settings.hotelProfile.contactInfo')}</h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="contactPhone">{t('settings.hotelProfile.phone')}</Label>
                        <Input
                          id="contactPhone"
                          type="tel"
                          value={profileForm.contactPhone || ''}
                          onChange={(e) => handleProfileChange('contactPhone', e.target.value)}
                          placeholder="+1 (555) 123-4567"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="contactEmail">{t('settings.hotelProfile.email')}</Label>
                        <Input
                          id="contactEmail"
                          type="email"
                          value={profileForm.contactEmail || ''}
                          onChange={(e) => handleProfileChange('contactEmail', e.target.value)}
                          placeholder="contact@hotel.com"
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="website">{t('settings.hotelProfile.website')}</Label>
                      <Input
                        id="website"
                        type="url"
                        value={profileForm.website || ''}
                        onChange={(e) => handleProfileChange('website', e.target.value)}
                        placeholder="https://www.hotel.com"
                      />
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="flex items-center gap-4 pt-4 border-t">
                    <Button
                      onClick={handleSaveProfile}
                      disabled={!profileForm.name || !profileForm.timezone}
                      loading={saveProfileMutation.isPending}
                    >
                      {t('common.save')}
                    </Button>
                    {profileSaved && (
                      <span className="text-sm text-success-foreground">{t('settings.hotelProfile.saved')}</span>
                    )}
                    {saveProfileMutation.error && (
                      <span className="text-sm text-destructive">{t('settings.hotelProfile.saveError')}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Setup Tab */}
          {activeTab === 'quick-setup' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">{t('settings.quickSetup.title')}</h2>
                <p className="text-sm text-muted-foreground">{t('settings.quickSetup.description')}</p>
              </div>

              <div className="divide-y divide-border">
                <div className="pb-6">
                  <ActionItems showAlways borderless />
                </div>
                <div className="pt-6">
                  <DemoDataCard showAlways borderless />
                </div>
              </div>
            </div>
          )}

          {/* Danger Zone Tab */}
          {activeTab === 'danger-zone' && (
            <div className="space-y-6">
              <Card className="border-destructive">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-destructive">
                      <AlertTriangle className="h-5 w-5 text-destructive-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-destructive">{t('settings.dangerZone.title')}</CardTitle>
                      <CardDescription>{t('settings.dangerZone.description')}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {resetComplete ? (
                    <Alert variant="success">
                      <AlertDescription>{t('settings.dangerZone.resetSuccess')}</AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                        <h3 className="font-medium mb-2">{t('settings.dangerZone.resetDatabase')}</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          {t('settings.dangerZone.resetDescription')}
                        </p>
                        <Button variant="destructive" onClick={() => setShowConfirmDialog(true)}>
                          {t('settings.dangerZone.resetButton')}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      <DialogRoot open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="p-6">
          <DialogHeader>
            <DialogTitle>{t('settings.dangerZone.resetConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('settings.dangerZone.resetConfirmDescription')}
            </DialogDescription>
          </DialogHeader>

          {resetMutation.error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{t('settings.dangerZone.resetError')}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2 mt-4">
            <p className="text-sm text-muted-foreground">
              {t('settings.dangerZone.typeToConfirm')}
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET"
              className="font-mono"
            />
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={!isConfirmValid}
              loading={resetMutation.isPending}
            >
              {t('settings.dangerZone.confirmReset')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </PageContainer>
  );
}
