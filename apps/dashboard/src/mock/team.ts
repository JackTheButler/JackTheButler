export type Role = 'admin' | 'agent';
export type MemberStatus = 'active' | 'invited' | 'disabled';

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: MemberStatus;
  lastActive: string;
  you?: boolean;
}

export const roleLabel: Record<Role, string> = { admin: 'Admin', agent: 'Agent' };
export const roleHint: Record<Role, string> = {
  admin: 'Full access — conversations, knowledge, apps, assistant, team & settings.',
  agent: 'Conversations only — handle and reply to chats.',
};

export const members: Member[] = [
  {
    id: 'u1',
    name: 'Arash K.',
    email: 'a.karimzadeh@gmail.com',
    role: 'admin',
    status: 'active',
    lastActive: 'Online',
    you: true,
  },
  {
    id: 'u2',
    name: 'Mara Lindqvist',
    email: 'mara@acme.co',
    role: 'admin',
    status: 'active',
    lastActive: '20m ago',
  },
  {
    id: 'u3',
    name: 'Tomás Reyes',
    email: 'tomas@acme.co',
    role: 'agent',
    status: 'active',
    lastActive: '2h ago',
  },
  {
    id: 'u4',
    name: 'Priya Nair',
    email: 'priya@acme.co',
    role: 'agent',
    status: 'active',
    lastActive: 'Yesterday',
  },
  {
    id: 'u5',
    name: 'jpark@acme.co',
    email: 'jpark@acme.co',
    role: 'agent',
    status: 'invited',
    lastActive: 'Invited 2d ago',
  },
  {
    id: 'u6',
    name: 'Sam Okafor',
    email: 'sam@acme.co',
    role: 'agent',
    status: 'disabled',
    lastActive: '3w ago',
  },
];

export const teamFilters = ['All', 'Admins', 'Agents', 'Invited'] as const;
export type TeamFilter = (typeof teamFilters)[number];

export function matchesTeamFilter(m: Member, f: TeamFilter): boolean {
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
