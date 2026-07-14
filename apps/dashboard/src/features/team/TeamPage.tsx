import { useMemo, useState } from 'react';
import { UserPlus, Shield, User, Ban, Copy, Check, Trash2, Link2 } from 'lucide-react';
import type { StaffMember, StaffRole } from '@janetheoperator/shared';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import { ListRow, RowMenu } from '@/components/ListRow';
import { Toolbar } from '@/components/Toolbar';
import { Loading } from '@/components/Loading';
import {
  Avatar,
  Badge,
  Button,
  Input,
  Select,
  SelectItem,
  Field,
  EmptyState,
  SegmentedControl,
  Dialog,
  DialogContent,
  DropdownMenuItem,
  toast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useSession } from '@/features/auth/useAuth';
import { useTeam, useInvite, useSetRole, useSetStatus, useCancelInvite, useInviteLink } from './useTeam';

const ROLE_LABEL: Record<StaffRole, string> = { admin: 'Admin', agent: 'Agent' };
const ROLE_HINT: Record<StaffRole, string> = {
  admin: 'Full access to Inbox, Knowledge, Apps, Assistant, Team & Settings.',
  agent: 'Limited access to Inbox and Knowledge only.',
};

const FILTERS = ['All', 'Admins', 'Agents', 'Invited'] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(m: StaffMember, f: Filter): boolean {
  switch (f) {
    case 'All':
      return true;
    case 'Admins':
      return m.role === 'admin' && m.status !== 'invited';
    case 'Agents':
      return m.role === 'agent' && m.status !== 'invited';
    case 'Invited':
      return m.status === 'invited';
  }
}

function lastActiveLabel(m: StaffMember): string {
  if (m.status === 'invited') return 'Invited, not yet accepted';
  if (!m.lastLoginAt) return 'Never signed in';
  const days = Math.floor((Date.now() - m.lastLoginAt) / 86_400_000);
  if (days <= 0) return 'Active today';
  if (days === 1) return 'Active yesterday';
  if (days < 30) return `Active ${days}d ago`;
  return 'Inactive 30d+';
}

/** The copyable accept-link row, shared by the create flow and re-share. */
function InviteLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Invite link copied');
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-2">
      <code className="min-w-0 flex-1 truncate text-xs text-muted">{link}</code>
      <Button size="sm" variant="outline" onClick={copy} className="shrink-0">
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

/** Standalone "here's the link again" popup for an existing invite. */
function InviteLinkDialog({
  link,
  open,
  onOpenChange,
}: {
  link: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dividers={false}
        title="Invite link"
        description="Share this link so they can set a password and join."
      >
        <div className="space-y-3">
          <InviteLinkBox link={link} />
          <div className="flex justify-end">
            <Button size="md" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({ member, isYou }: { member: StaffMember; isYou: boolean }) {
  const setRole = useSetRole();
  const setStatus = useSetStatus();
  const cancelInvite = useCancelInvite();
  const inviteLink = useInviteLink();
  const invited = member.status === 'invited';
  const disabled = member.status === 'disabled';
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const showInviteLink = () =>
    inviteLink.mutate(member.id, {
      onSuccess: ({ token }) =>
        setLink(`${window.location.origin}/accept-invite?token=${token}`),
      onError: () => toast.error('Could not load the invite link.'),
    });

  const onError = (e: unknown) =>
    toast.error(
      e instanceof ApiError && e.message === 'last_admin'
        ? "That's the last admin. Promote someone else first."
        : 'Could not update member.',
    );

  const flipRole = () =>
    setRole.mutate(
      { id: member.id, role: member.role === 'admin' ? 'agent' : 'admin' },
      { onError },
    );
  const flipStatus = () =>
    setStatus.mutate(
      { id: member.id, action: disabled ? 'enable' : 'disable' },
      { onError },
    );
  const doCancelInvite = () =>
    cancelInvite.mutate(member.id, {
      onSuccess: () => {
        setConfirmCancel(false);
        toast.success('Invite canceled');
      },
      onError: () => toast.error('Could not cancel the invite.'),
    });

  return (
    <>
    <ListRow
      disabled={disabled}
      leading={<Avatar name={member.name || member.email} />}
      status={
        (invited || disabled) && (
          <Badge tone="muted" className="hidden shrink-0 sm:inline-flex">
            {invited ? 'Invited' : 'Disabled'}
          </Badge>
        )
      }
      trailing={
        isYou ? (
          <span className="grid h-9 w-9 shrink-0" />
        ) : (
          <RowMenu>
            {!invited && (
              <DropdownMenuItem onSelect={flipRole}>
                {member.role === 'admin' ? <User size={14} /> : <Shield size={14} />}
                Make {member.role === 'admin' ? 'Agent' : 'Admin'}
              </DropdownMenuItem>
            )}
            {!invited && (
              <DropdownMenuItem onSelect={flipStatus}>
                <Ban size={14} /> {disabled ? 'Reactivate' : 'Deactivate'}
              </DropdownMenuItem>
            )}
            {invited && (
              <DropdownMenuItem onSelect={showInviteLink}>
                <Link2 size={14} /> Copy invite link
              </DropdownMenuItem>
            )}
            {invited && (
              <DropdownMenuItem onSelect={() => setConfirmCancel(true)} destructive>
                <Trash2 size={14} /> Cancel invite
              </DropdownMenuItem>
            )}
          </RowMenu>
        )
      }
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">{member.name || member.email}</span>
        {isYou && (
          <Badge tone="muted" className="shrink-0 normal-case">
            You
          </Badge>
        )}
        <Badge tone={member.role === 'admin' ? 'accent' : 'muted'} className="shrink-0">
          {ROLE_LABEL[member.role]}
        </Badge>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">
        {member.email} · {lastActiveLabel(member)}
      </p>
    </ListRow>

      <InviteLinkDialog
        link={link ?? ''}
        open={link !== null}
        onOpenChange={(o) => !o && setLink(null)}
      />

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent dividers={false} showClose={false} title="Cancel invite?">
          <div className="space-y-4">
            <p className="text-sm text-muted">
              This permanently removes the pending invite for{' '}
              <span className="text-ink">{member.email}</span>. They haven't joined yet, so nothing
              else is affected. You can always invite them again.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="md" onClick={() => setConfirmCancel(false)}>
                Keep invite
              </Button>
              <Button
                variant="destructive"
                size="md"
                onClick={doCancelInvite}
                disabled={cancelInvite.isPending}
              >
                {cancelInvite.isPending ? 'Canceling…' : 'Cancel invite'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const invite = useInvite();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('agent');
  const [link, setLink] = useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setRole('agent');
    setLink(null);
  };

  const submit = () => {
    invite.mutate(
      { email, role },
      {
        onSuccess: (r) => setLink(`${window.location.origin}/accept-invite?token=${r.token}`),
        onError: (e) =>
          toast.error(
            e instanceof ApiError && e.message === 'email_taken'
              ? 'Someone with that email already exists.'
              : 'Could not send the invite.',
          ),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent
        dividers={false}
        title="Invite teammate"
        description={
          link
            ? 'Share this link so they can set a password and join.'
            : 'Create a unique invite link to share with your teammate.'
        }
      >
        {link ? (
          <div className="space-y-3">
            <InviteLinkBox link={link} />
            <div className="flex justify-end">
              <Button size="md" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Email">
              <Input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Role" hint={ROLE_HINT[role]}>
              <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="md" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="md" onClick={submit} disabled={!email.trim() || invite.isPending}>
                {invite.isPending ? 'Creating…' : 'Create invite'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TeamPage() {
  const { user } = useSession();
  const { data, isLoading } = useTeam();
  const members = data?.members ?? [];
  const [filter, setFilter] = useState<Filter>('All');
  const [inviteOpen, setInviteOpen] = useState(false);

  const visible = useMemo(() => members.filter((m) => matchesFilter(m, filter)), [members, filter]);
  const active = members.filter((m) => m.status === 'active').length;
  const pending = members.filter((m) => m.status === 'invited').length;

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <PageHeader
          title="Team"
          subtitle={`${active} active${pending > 0 ? ` · ${pending} pending` : ''}`}
          action={
            <Button size="md" onClick={() => setInviteOpen(true)}>
              <UserPlus size={16} /> Invite
            </Button>
          }
        />

        <Toolbar
          className="mt-6"
          filters={
            <SegmentedControl
              aria-label="Filter team"
              options={FILTERS}
              value={filter}
              onChange={setFilter}
              className="-mx-4 px-4 md:mx-0 md:px-0"
            />
          }
        />

        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-panel">
          {isLoading ? (
            <Loading />
          ) : visible.length === 0 ? (
            <EmptyState>No one here.</EmptyState>
          ) : (
            visible.map((m) => <MemberRow key={m.id} member={m} isYou={m.id === user?.id} />)
          )}
        </div>
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </PageShell>
  );
}
