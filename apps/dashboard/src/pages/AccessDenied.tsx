import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldX, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AccessDeniedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <ShieldX className="w-8 h-8 text-destructive" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">
          {t('errors.accessDenied')}
        </h1>

        <p className="text-muted-foreground mb-8">
          {t('errors.accessDeniedDescription')}
        </p>

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 me-2" />
            {t('common.goBack')}
          </Button>
          <Button onClick={() => navigate('/')}>
            <Home className="w-4 h-4 me-2" />
            {t('common.home')}
          </Button>
        </div>
      </div>
    </div>
  );
}
