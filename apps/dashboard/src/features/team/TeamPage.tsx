import { useMemo, useState } from 'react';
import { UserPlus, MoreVertical, Shield, User, RefreshCw, Ban, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import {
  Badge,
  Button,
  Input,
  SegmentedControl,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  cn,
} from '@/components/ui';
import {
  members,
  roleLabel,
  roleHint,
  teamFilters,
  matchesTeamFilter,
  type Member,
  type Role,
  type TeamFilter,
} from '@/mock/team';

const field =
  'w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent/40';

function MemberRow({ member }: { member: Member }) {
  const invited = member.status === 'invited';
  const disabled = member.status === 'disabled';
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-line px-3 py-3 last:border-b-0 md:px-4',
        disabled && 'opacity-60',
      )}
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-xs font-semibold text-muted ring-1 ring-line">
        {member.name.slice(0, 2).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{member.name}</span>
          {member.you && (
            <Badge tone="muted" className="shrink-0 normal-case">
              You
            </Badge>
          )}
          <Badge tone={member.role === 'admin' ? 'accent' : 'muted'} className="shrink-0">
            {roleLabel[member.role]}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {member.email} · {member.lastActive}
        </p>
      </div>

      {(invited || disabled) && (
        <span className="hidden shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted ring-1 ring-line sm:inline">
          {invited ? 'Invited' : 'Disabled'}
        </span>
      )}

      {member.you ? (
        <span className="grid h-9 w-9 shrink-0" />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Member actions">
              <MoreVertical size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              {member.role === 'admin' ? <User size={14} /> : <Shield size={14} />}
              Make {member.role === 'admin' ? 'Agent' : 'Admin'}
            </DropdownMenuItem>
            {invited && (
              <DropdownMenuItem>
                <RefreshCw size={14} /> Resend invite
              </DropdownMenuItem>
            )}
            <DropdownMenuItem>
              <Ban size={14} /> {disabled ? 'Reactivate' : 'Deactivate'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive>
              <Trash2 size={14} /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function InviteTeammate() {
  const [role, setRole] = useState<Role>('agent');
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <UserPlus size={15} /> Invite teammate
        </Button>
      </DialogTrigger>
      <DialogContent title="Invite teammate" description="They’ll get an email to set a password.">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Email</span>
            <Input type="email" placeholder="name@company.com" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Role</span>
            <select
              className={field}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
            <span className="mt-1 block text-xs text-muted">{roleHint[role]}</span>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="md">
              Cancel
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button size="md">Send invite</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TeamPage() {
  const [filter, setFilter] = useState<TeamFilter>('All');

  const visible = useMemo(() => members.filter((m) => matchesTeamFilter(m, filter)), [filter]);
  const active = members.filter((m) => m.status !== 'invited').length;
  const pending = members.filter((m) => m.status === 'invited').length;

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Team</h1>
            <p className="mt-1 text-sm text-muted">
              {active} members{pending > 0 && ` · ${pending} pending`}
            </p>
          </div>
          <InviteTeammate />
        </header>

        <SegmentedControl
          aria-label="Filter team"
          options={teamFilters}
          value={filter}
          onChange={setFilter}
          className="-mx-4 mt-6 px-4 md:mx-0 md:px-0"
        />

        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-panel">
          {visible.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-muted">No one here.</p>
          ) : (
            visible.map((m) => <MemberRow key={m.id} member={m} />)
          )}
        </div>
      </div>
    </PageShell>
  );
}
