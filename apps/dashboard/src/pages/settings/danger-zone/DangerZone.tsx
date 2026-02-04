import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { PageContainer } from '@/components';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DialogRoot,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ResetResponse {
  success: boolean;
  tablesCleared?: string[];
  error?: string;
}

export function DangerZonePage() {
  const { t } = useTranslation();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetComplete, setResetComplete] = useState(false);

  const resetMutation = useMutation({
    mutationFn: () => api.post<ResetResponse>('/seed/reset', { confirm: 'RESET' }),
    onSuccess: () => {
      setShowConfirmDialog(false);
      setConfirmText('');
      setResetComplete(true);
      // Clear localStorage so demo data card reappears
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

  return (
    <PageContainer>
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
