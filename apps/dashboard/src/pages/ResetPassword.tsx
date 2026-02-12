import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { setLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/contexts/ThemeContext';

export function ResetPasswordPage() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isRTL = i18n.language === 'ar';
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    if (!token) {
      setError(t('auth.invalidToken'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message || t('auth.resetFailed'));
      }
    } catch {
      setError(t('auth.resetFailed'));
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

          {!token ? (
            <div className="text-center space-y-2">
              <p className="text-sm text-destructive">{t('auth.invalidToken')}</p>
              <div className="pt-4">
                <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                  {t('auth.forgotPasswordTitle')}
                </Link>
              </div>
            </div>
          ) : success ? (
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold text-foreground">{t('auth.passwordUpdated')}</h2>
              <p className="text-sm text-muted-foreground">{t('auth.passwordUpdatedDesc')}</p>
              <div className="pt-4">
                <Link to="/login" className="text-sm text-primary hover:underline">
                  {t('auth.backToSignIn')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-foreground text-center mb-6">{t('auth.resetPasswordTitle')}</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('auth.newPassword')}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                    minLength={8}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('auth.confirmPassword')}</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                    minLength={8}
                  />
                </div>

                <Button type="submit" loading={loading} className="w-full">
                  {t('auth.resetPassword')}
                </Button>
              </form>
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
