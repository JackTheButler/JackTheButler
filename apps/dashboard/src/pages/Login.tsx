import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { setLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppConfig } from '@/contexts/AppConfigContext';
import { DemoOrbit } from '@/components/ui/DemoOrbit';

export function LoginPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsVerification, setNeedsVerification] = useState(false);
  const { config } = useAppConfig();
  const registrationEnabled = config?.registrationEnabled ?? false;
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // Check if setup is needed and if registration is enabled on mount
  useEffect(() => {
    const checkSetupState = async () => {
      try {
        const response = await fetch('/api/v1/setup/state');
        const data = await response.json();

        if (data.isFreshInstall) {
          // Redirect to setup wizard
          navigate('/setup', { replace: true });
          return;
        }
      } catch {
        // On error, proceed to login (setup endpoint might not exist in older versions)
      }

      setCheckingSetup(false);
    };

    checkSetupState();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNeedsVerification(false);
    setResent(false);
    setLoading(true);

    try {
      await login(email, password, rememberMe);
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError && err.details?.reason === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerification(true);
      }
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResending(true);
    setResent(false);
    try {
      await fetch('/api/v1/auth/resend-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } catch {
      // Silently fail — endpoint always returns success
    } finally {
      setResending(false);
    }
  };

  const isRTL = i18n.language === 'ar';
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Show loading while checking setup state
  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted flex flex-col items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-card rounded-lg shadow-md w-full max-w-4xl flex flex-col-reverse md:flex-row overflow-hidden relative">
        {/* Branding section - Top on mobile, Left on desktop */}
        <div className="bg-primary md:w-3/5 flex flex-col items-center justify-center gap-6 p-8 border-t md:border-t-0 md:border-r border-border">
          <DemoOrbit />
          <h2 className="text-lg font-semibold text-primary-foreground text-center">{t('auth.demoTagline')}</h2>
          <div className="w-full border border-primary-foreground/20 rounded-lg overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-primary-foreground/20">
              <div className="p-4 flex flex-col gap-1">
                <span className="text-2xl font-bold text-primary-foreground">{t('auth.demoStat1Value')}</span>
                <span className="text-xs text-primary-foreground/60">{t('auth.demoStat1Desc')}</span>
                <span className="text-xs font-semibold text-primary-foreground mt-2">{t('auth.demoStat1Label')}</span>
              </div>
              <div className="p-4 flex flex-col gap-1">
                <span className="text-2xl font-bold text-primary-foreground">{t('auth.demoStat2Value')}</span>
                <span className="text-xs text-primary-foreground/60">{t('auth.demoStat2Desc')}</span>
                <span className="text-xs font-semibold text-primary-foreground mt-2">{t('auth.demoStat2Label')}</span>
              </div>
            </div>
            <div className="border-t border-primary-foreground/20 p-4">
              <p className="text-xs text-primary-foreground/90 italic">{t('auth.demoQuote')}</p>
            </div>
          </div>
        </div>

        {/* Login form - Bottom on mobile, Right on desktop */}
        <div className="relative md:w-2/5">
          <div className="absolute top-2 left-2">
            <Tooltip content={isDark ? t('common.switchToLight') : t('common.switchToDark')} side="right">
              <span>
                <ThemeToggle />
              </span>
            </Tooltip>
          </div>

          <div className="p-6 pt-12">
          <div className="flex justify-center mb-6">
            <img src="/favicon.svg" alt={t('app.name')} className="w-16 h-16 object-contain dark:invert" />
          </div>
          <h2 className="text-lg font-semibold text-foreground text-center">{t('auth.loginTitle')}</h2>
          <p className="text-sm text-muted-foreground text-center mt-1 mb-6">{t('auth.loginDesc')}</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  <p>{error}</p>
                  {needsVerification && (
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resending || resent}
                      className="mt-2 text-sm underline hover:no-underline disabled:opacity-50"
                    >
                      {resent ? t('auth.verificationResent') : resending ? '...' : t('auth.resendVerification')}
                    </button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('auth.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={setRememberMe}
                />
                <label htmlFor="rememberMe" className="text-sm text-muted-foreground cursor-pointer">
                  {t('auth.rememberMe')}
                </label>
              </div>
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                {t('auth.forgotPassword')}
              </Link>
            </div>

            <Button type="submit" loading={loading} className="w-full">
              {t('auth.signIn')}
            </Button>
          </form>

          {registrationEnabled && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {t('auth.noAccount')}{' '}
              <Link to="/register" className="text-primary hover:underline">
                {t('auth.createOneLink')}
              </Link>
            </div>
          )}
          </div>{/* end inner p-6 */}
        </div>{/* end form panel */}
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm">
        {SUPPORTED_LANGUAGES.map((lang, index) => (
          <span key={lang.code} className="flex items-center gap-2">
            <button
              onClick={() => setLanguage(lang.code)}
              className={`transition-colors ${lang.code === i18n.language ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {lang.label}
            </button>
            {index < SUPPORTED_LANGUAGES.length - 1 && <span className="text-muted-foreground/50">|</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
