import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { setLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/contexts/ThemeContext';

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

  // Check if setup is needed on mount
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
    setLoading(true);

    try {
      await login(email, password, rememberMe);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
    } finally {
      setLoading(false);
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
      <div className="bg-card rounded-lg shadow-md w-full max-w-sm md:max-w-2xl md:flex overflow-hidden relative">
        {/* Branding section - Top on mobile, Left on desktop */}
        <div className="flex flex-col items-center justify-center p-6 md:p-8 bg-primary md:w-1/2">
          <img src="/jack-the-butler-inverted.png" alt={t('app.name')} className="w-40 h-40 md:w-48 md:h-48 object-contain dark:hidden" />
          <img src="/jack-the-butler.png" alt={t('app.name')} className="w-40 h-40 md:w-48 md:h-48 object-contain hidden dark:block" />
          <h1 className="text-xl md:text-2xl font-semibold text-primary-foreground mt-3 md:mt-4 text-center">{t('app.name')}</h1>
          <p className="text-primary-foreground text-xs mb-2 text-center"><span className="text-red-500 font-bold">/</span><span className="text-primary-foreground font-bold">JACK</span><span className="text-red-500 font-bold">/</span> <span className="text-primary-foreground font-bold">J</span>oint <span className="text-primary-foreground font-bold">A</span>I <span className="text-primary-foreground font-bold">C</span>ontrol <span className="text-primary-foreground font-bold">K</span>ernel</p>
          <p className="text-primary-foreground/60 text-sm md:text-base mt-1 text-center">{t('app.tagline')}</p>
        </div>

        {/* Login form - Bottom on mobile, Right on desktop */}
        <div className="p-6 md:w-1/2">

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
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

            <Button type="submit" loading={loading} className="w-full">
              {t('auth.signIn')}
            </Button>
          </form>
        </div>
        <div className="absolute top-2 left-2 text-primary-foreground [&_button]:hover:bg-primary-foreground/20">
          <Tooltip content={isDark ? t('common.switchToLight') : t('common.switchToDark')} side="right">
            <span>
              <ThemeToggle />
            </span>
          </Tooltip>
        </div>
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
