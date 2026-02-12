import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/contexts/ThemeContext';
import { setLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n';

export function VerifyEmailPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const checkAuth = useAuth((s) => s.checkAuth);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);

  const isRTL = i18n.language === 'ar';
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage(t('auth.invalidToken'));
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch('/api/v1/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (res.ok) {
          const data = await res.json();

          if (data.tokens) {
            // Auto-login: store tokens and redirect to dashboard
            api.setRememberMe(false);
            api.setToken(data.tokens.accessToken);
            api.setRefreshToken(data.tokens.refreshToken);
            await checkAuth();
            navigate('/', { replace: true });
            return;
          }

          // Account requires approval — show success but no auto-login
          setRequiresApproval(data.requiresApproval === true);
          setStatus('success');
        } else {
          const data = await res.json().catch(() => ({}));
          setErrorMessage(data.error?.message || t('auth.invalidToken'));
          setStatus('error');
        }
      } catch {
        setErrorMessage(t('auth.invalidToken'));
        setStatus('error');
      }
    };

    verify();
  }, [token, t, navigate, checkAuth]);

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

          {status === 'loading' && (
            <div className="text-center text-muted-foreground animate-pulse">
              {t('auth.verifyingEmail')}
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold text-foreground">{t('auth.emailVerified')}</h2>
              <p className="text-sm text-muted-foreground">
                {requiresApproval ? t('auth.registrationSuccessApproval') : t('auth.emailVerifiedDesc')}
              </p>
              <div className="pt-4">
                <Link to="/login" className="text-sm text-primary hover:underline">
                  {t('auth.backToSignIn')}
                </Link>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold text-destructive">{t('auth.verificationFailed')}</h2>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <div className="pt-4">
                <Link to="/login" className="text-sm text-primary hover:underline">
                  {t('auth.backToSignIn')}
                </Link>
              </div>
            </div>
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
