import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { setLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/contexts/ThemeContext';

export function ForgotPasswordPage() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const isRTL = i18n.language === 'ar';
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // Always show success (backend returns 200 regardless of email existence)
      if (res.ok) {
        setSent(true);
      }
    } finally {
      setLoading(false);
      // Show success even on error to prevent email enumeration
      setSent(true);
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

          {sent ? (
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold text-foreground">{t('auth.resetEmailSent')}</h2>
              <p className="text-sm text-muted-foreground">{t('auth.resetEmailSentDesc')}</p>
              <div className="pt-4">
                <Link to="/login" className="text-sm text-primary hover:underline">
                  {t('auth.backToSignIn')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-foreground text-center">{t('auth.forgotPasswordTitle')}</h2>
              <p className="text-sm text-muted-foreground text-center mt-1 mb-6">{t('auth.forgotPasswordDesc')}</p>

              <form onSubmit={handleSubmit} className="space-y-4">
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

                <Button type="submit" loading={loading} className="w-full">
                  {t('auth.sendResetLink')}
                </Button>
              </form>

              <div className="mt-4 text-center">
                <Link to="/login" className="text-sm text-primary hover:underline">
                  {t('auth.backToSignIn')}
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
