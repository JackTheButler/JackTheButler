import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { setLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/contexts/ThemeContext';

interface RegisterResult {
  success: boolean;
  requiresVerification: boolean;
  requiresApproval: boolean;
  tokens?: { accessToken: string; refreshToken: string };
}

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const checkAuth = useAuth((s) => s.checkAuth);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

  const isRTL = i18n.language === 'ar';
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Check if registration is enabled on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/v1/auth/registration-status');
        const data = await res.json();
        setRegistrationEnabled(data.registrationEnabled === true);
      } catch {
        // Default to disabled if endpoint unavailable
      }
      setCheckingStatus(false);
    };
    checkStatus();
  }, []);

  const getSuccessMessage = (res: RegisterResult): string => {
    if (res.requiresVerification && res.requiresApproval) {
      return t('auth.registrationSuccessVerifyApproval');
    }
    if (res.requiresVerification) {
      return t('auth.registrationSuccessVerify');
    }
    if (res.requiresApproval) {
      return t('auth.registrationSuccessApproval');
    }
    return t('auth.registrationSuccessLogin');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (res.ok) {
        if (data.tokens) {
          // Auto-login: grace period, no approval needed
          api.setRememberMe(false);
          api.setToken(data.tokens.accessToken);
          api.setRefreshToken(data.tokens.refreshToken);
          await checkAuth();
          navigate('/', { replace: true });
          return;
        }
        setResult(data);
      } else {
        setError(data.error?.message || t('auth.loginFailed'));
      }
    } catch {
      setError(t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted flex flex-col items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-card rounded-lg shadow-md w-full max-w-sm overflow-hidden relative">
        <div className="absolute top-2 left-2">
          <Tooltip content={isDark ? t('common.switchToLight') : t('common.switchToDark')} side="right">
            <span>
              <ThemeToggle />
            </span>
          </Tooltip>
        </div>

        <div className="p-6 pt-12">
          <div className="flex justify-center mb-6">
            <img src="/jack-the-butler-inverted.png" alt={t('app.name')} className="w-16 h-16 object-contain dark:hidden" />
            <img src="/jack-the-butler.png" alt={t('app.name')} className="w-16 h-16 object-contain hidden dark:block" />
          </div>

          {checkingStatus ? (
            <div className="text-center text-muted-foreground animate-pulse">
              {t('common.loading')}
            </div>
          ) : !registrationEnabled ? (
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold text-foreground">{t('auth.registrationDisabled')}</h2>
              <p className="text-sm text-muted-foreground">{t('auth.registrationDisabledDesc')}</p>
              <div className="pt-4">
                <Link to="/login" className="text-sm text-primary hover:underline">
                  {t('auth.backToSignIn')}
                </Link>
              </div>
            </div>
          ) : result ? (
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold text-foreground">{t('auth.registrationSuccess')}</h2>
              <p className="text-sm text-muted-foreground">{getSuccessMessage(result)}</p>
              <div className="pt-4">
                <Link to="/login" className="text-sm text-primary hover:underline">
                  {t('auth.backToSignIn')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-foreground text-center">{t('auth.registerTitle')}</h2>
              <p className="text-sm text-muted-foreground text-center mt-1 mb-6">{t('auth.registerDesc')}</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('auth.name')}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>

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
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('auth.passwordHint')}</p>
                </div>

                <Button type="submit" loading={loading} className="w-full">
                  {t('auth.createAccount')}
                </Button>
              </form>

              <div className="mt-4 text-center text-sm text-muted-foreground">
                {t('auth.alreadyHaveAccount')}{' '}
                <Link to="/login" className="text-primary hover:underline">
                  {t('auth.signInLink')}
                </Link>
              </div>
            </>
          )}
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
