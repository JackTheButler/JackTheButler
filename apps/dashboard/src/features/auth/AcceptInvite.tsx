import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { AuthShell } from './AuthScreens';
import { useAcceptInvite } from './useAuth';

function errorText(err: unknown): string {
  const code = err instanceof ApiError ? err.message : '';
  if (code === 'invalid_invite') return 'This invite link is invalid or has already been used.';
  if (code === 'invalid_input') return 'Please check the fields and try again.';
  return 'Something went wrong. Please try again.';
}

/** Public page reached via the invite link an admin shares. Sets the
 *  invitee's name + password, then logs them in and drops into the app. */
export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const accept = useAcceptInvite();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  if (!token) {
    return (
      <AuthShell title="Invite link broken" subtitle="This link is missing its invite token.">
        <p className="text-sm text-muted">
          Ask whoever invited you to send the full link again.
        </p>
      </AuthShell>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    accept.mutate({ token, name, password }, { onSuccess: () => navigate('/', { replace: true }) });
  };

  return (
    <AuthShell title="Join the team" subtitle="Set your name and a password to get started.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        {accept.isError && <p className="text-xs text-red-600">{errorText(accept.error)}</p>}
        <Button type="submit" size="md" className="w-full" disabled={accept.isPending}>
          {accept.isPending ? 'Joining…' : 'Join'}
        </Button>
      </form>
    </AuthShell>
  );
}
