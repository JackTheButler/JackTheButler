import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useLogin, useSetup } from './useAuth';

function errorText(err: unknown): string {
  const code = err instanceof ApiError ? err.message : '';
  switch (code) {
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    case 'invalid_input':
      return 'Please check the fields and try again.';
    case 'setup_already_done':
      return 'An admin account already exists.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-sm font-bold text-on-accent">
            J
          </div>
          <span className="text-sm font-semibold">Jane</span>
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
        <div className="rounded-xl border border-line bg-panel p-5">{children}</div>
      </div>
    </div>
  );
}

export function LoginScreen() {
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to the support console.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        {login.isError && <p className="text-xs text-red-600">{errorText(login.error)}</p>}
        <Button type="submit" size="md" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}

export function SetupScreen() {
  const setup = useSetup();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setup.mutate({ name, email, password });
  };

  return (
    <AuthShell title="Create admin account" subtitle="First-time setup — this creates the owner account.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
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
        {setup.isError && <p className="text-xs text-red-600">{errorText(setup.error)}</p>}
        <Button type="submit" size="md" className="w-full" disabled={setup.isPending}>
          {setup.isPending ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
