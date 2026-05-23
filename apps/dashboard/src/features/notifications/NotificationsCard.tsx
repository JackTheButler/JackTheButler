import { Alert, Card, SwitchField, toast } from '@/components/ui';
import { usePush } from './usePush';

/** Per-device push toggle, shown on the Profile tab. Available to all staff. */
export function NotificationsCard() {
  const push = usePush();

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
        label="Desktop notifications"
        desc="Get notified about new messages in conversations assigned to you, even when this tab isn't focused."
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
          Notifications are blocked in your browser settings — allow them there, then turn this on.
        </Alert>
      )}
      {push.supported && push.enabled && push.permission !== 'denied' && (
        <p className="mt-2 text-xs text-muted">
          Applies to this device only. Install the app for the most reliable delivery.
        </p>
      )}
    </Card>
  );
}
