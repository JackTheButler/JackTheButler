import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { FlaskConical, X, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import { useDismissible } from '@/hooks/useDismissible';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface DemoDataResponse {
  success: boolean;
  created?: {
    guests: number;
    reservations: number;
    knowledgeBase: number;
  };
  error?: string;
}

const COMPLETED_KEY = 'demo-data-loaded';

/**
 * Card that allows users to populate the system with demo data for testing.
 * Once data is loaded, state is persisted to localStorage so the button
 * is replaced with a success message. User can close the card with X.
 */
export function DemoDataCard() {
  const { t } = useTranslation();
  const { isDismissed, dismiss } = useDismissible('demo-data', true);
  const [completed, setCompleted] = useState(() => {
    return localStorage.getItem(COMPLETED_KEY) === 'true';
  });
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.post<DemoDataResponse>('/seed/demo', {}),
    onSuccess: () => {
      setShowConfirmDialog(false);
      setCompleted(true);
      localStorage.setItem(COMPLETED_KEY, 'true');
    },
  });

  const handleConfirm = () => {
    mutation.mutate();
  };

  if (isDismissed) {
    return null;
  }

  return (
    <>
    <Card>
      <CardHeader className="relative">
        <button
          onClick={dismiss}
          className="absolute top-4 end-4 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-info">
            <FlaskConical className="h-5 w-5 text-info-foreground" />
          </div>
          <CardTitle>{t('home.demoData.title')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground mb-4">
          {t('home.demoData.description')}
        </p>

        {mutation.error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{t('home.demoData.error')}</AlertDescription>
          </Alert>
        )}

        {completed ? (
          <div>
            <p className="flex items-center gap-2 text-sm text-success-foreground mb-2">
              <Check className="h-4 w-4" />
              {t('home.demoData.success')}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="text-foreground font-medium">{t('home.demoData.nextStepLabel')}</span>{' '}
              {t('home.demoData.nextStepText')}
            </p>
            <Link to="/tools/knowledge-base">
              <Button size="sm">
                {t('home.demoData.reindexAction')}
                <ArrowRight className="h-3.5 w-3.5 ms-1.5 rtl:rotate-180" />
              </Button>
            </Link>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfirmDialog(true)}
          >
            {t('home.demoData.createAll')}
          </Button>
        )}
      </CardContent>
    </Card>

    <DialogRoot open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <DialogContent className="p-6">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning">
              <AlertTriangle className="h-5 w-5 text-warning-foreground" />
            </div>
            <DialogTitle>{t('home.demoData.confirmTitle')}</DialogTitle>
          </div>
          <DialogDescription className="mt-2">
            {t('home.demoData.confirmDescription')}
          </DialogDescription>
        </DialogHeader>

        {mutation.error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{t('home.demoData.error')}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            loading={mutation.isPending}
          >
            {t('home.demoData.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
    </>
  );
}
