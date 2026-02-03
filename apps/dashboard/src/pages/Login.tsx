import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { setLanguage } from '@/lib/i18n';

export function LoginPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'ar', label: 'العربية' },
  ];

  const currentLanguage = languages.find((l) => l.code === i18n.language) || languages[0];
  const isRTL = i18n.language === 'ar';

  return (
    <div className="min-h-screen bg-muted flex flex-col items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-card rounded-lg shadow-md w-full max-w-sm md:max-w-2xl md:flex overflow-hidden">
        {/* Branding section - Top on mobile, Left on desktop */}
        <div className="flex flex-col items-center justify-center p-6 md:p-8 bg-primary md:w-1/2">
          <img src="/jack-the-butler-inverted.png" alt={t('app.name')} className="w-40 h-40 md:w-48 md:h-48 object-contain" />
          <h1 className="text-xl md:text-2xl font-semibold text-primary-foreground mt-3 md:mt-4">{t('app.name')}</h1>
          <p className="text-primary-foreground/60 text-sm md:text-base mt-1">{t('app.tagline')}</p>
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
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger>
          <button className="mt-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            {currentLanguage.label}
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {languages.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              className={lang.code === i18n.language ? 'bg-muted' : ''}
            >
              {lang.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
