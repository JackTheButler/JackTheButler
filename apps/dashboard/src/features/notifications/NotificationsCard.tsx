import { Alert, Button, Card, SwitchField, toast } from '@/components/ui';
import { useInstallPrompt } from '@/lib/useInstallPrompt';
import { usePush } from './usePush';

/** Per-device push toggle, shown on the Profile tab. Available to all staff. */
export function NotificationsCard() {
  const push = usePush();
  const install = useInstallPrompt();

  const onToggle = async (next: boolean) => {
    try {
      if (next) {
        const ok = await push.subscribe();
        toast[ok ? 'success' : 'error'](
          ok ? 'Notifications enabled' : 'Notifications were blocked in your browser.',
        );
      } else {
        await push.unsubscribe();
        toast.success('Notifications disabled');
      }
    } catch {
      toast.error('Could not update notifications.');
    }
  };

  return (
    <Card title="Notifications">
      <SwitchField
        label="Push notifications"
        desc="Get notified about new messages assigned to you, even when the app isn't open. Applies to this device."
        checked={push.subscribed}
        onCheckedChange={onToggle}
        disabled={!push.supported || !push.enabled || push.busy}
      />
      {!push.supported && (
        <Alert className="mt-2">This browser doesn't support push notifications.</Alert>
      )}
      {push.supported && !push.enabled && (
        <Alert className="mt-2">Push notifications aren't configured on this server yet.</Alert>
      )}
      {push.supported && push.enabled && push.permission === 'denied' && (
        <Alert variant="warning" className="mt-2">
          Notifications are blocked in your browser settings. Allow them there, then turn this on.
        </Alert>
      )}
      {install.canInstall && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-xs text-muted">Install the app for the most reliable delivery.</p>
          <Button size="sm" variant="outline" onClick={install.promptInstall} className="shrink-0">
            Install app
          </Button>
        </div>
      )}
    </Card>
  );
}
