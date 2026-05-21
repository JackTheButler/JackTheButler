import { useMemo, useState } from 'react';
import { UserPlus, Shield, User, RefreshCw, Ban, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import { ListRow, RowMenu } from '@/components/ListRow';
import { Toolbar } from '@/components/Toolbar';
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
  DialogTrigger,
  DialogContent,
  DialogClose,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

function MemberRow({ member }: { member: Member }) {
  const invited = member.status === 'invited';
  const disabled = member.status === 'disabled';
  return (
    <ListRow
      disabled={disabled}
      leading={<Avatar name={member.name} />}
      status={
        (invited || disabled) && (
          <Badge tone="muted" className="hidden shrink-0 sm:inline-flex">
            {invited ? 'Invited' : 'Disabled'}
          </Badge>
        )
      }
      trailing={
        member.you ? (
          <span className="grid h-9 w-9 shrink-0" />
        ) : (
          <RowMenu>
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
          </RowMenu>
        )
      }
    >
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
    </ListRow>
  );
}

function InviteTeammate() {
  const [role, setRole] = useState<Role>('agent');
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="md">
          <UserPlus size={16} /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent title="Invite teammate" description="They’ll get an email to set a password.">
        <div className="space-y-3">
          <Field label="Email">
            <Input type="email" placeholder="name@company.com" />
          </Field>
          <Field label="Role" hint={roleHint[role]}>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </Select>
          </Field>
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
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <PageHeader
          title="Team"
          subtitle={`${active} members${pending > 0 ? ` · ${pending} pending` : ''}`}
          action={<InviteTeammate />}
        />

        <Toolbar
          className="mt-6"
          filters={
            <SegmentedControl
              aria-label="Filter team"
              options={teamFilters}
              value={filter}
              onChange={setFilter}
              className="-mx-4 px-4 md:mx-0 md:px-0"
            />
          }
        />

        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-panel">
          {visible.length === 0 ? (
            <EmptyState>No one here.</EmptyState>
          ) : (
            visible.map((m) => <MemberRow key={m.id} member={m} />)
          )}
        </div>
      </div>
    </PageShell>
  );
}
