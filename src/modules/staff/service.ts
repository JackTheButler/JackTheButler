import { randomUUID } from 'node:crypto';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { StaffMember, StaffRole } from '@janetheoperator/shared';
import { db } from '@/db/client.js';
import { staff, type Staff } from '@/db/schema/index.js';
import { AppError } from '@/core/errors.js';
import { hashPassword } from '@/modules/auth/password.js';

/** Staff management (admin-only at the route layer). The invite flow has no
 *  email yet — `inviteStaff` returns a token the admin shares manually, and
 *  `acceptInvite` (called from a public auth route) sets the password. */

function toMember(s: Staff): StaffMember {
  return {
    id: s.id,
    email: s.email,
    name: s.name,
    role: s.role,
    status: s.status,
    lastLoginAt: s.lastLoginAt ? s.lastLoginAt.getTime() : null,
    createdAt: s.createdAt.getTime(),
  };
}

export function listStaff(): StaffMember[] {
  return db.select().from(staff).orderBy(desc(staff.createdAt)).all().map(toMember);
}

function getOrThrow(id: string): Staff {
  const row = db.select().from(staff).where(eq(staff.id, id)).get();
  if (!row) throw new AppError('staff_not_found', 404);
  return row;
}

/** Active admins other than `exceptId` — guards against locking out admin
 *  access by demoting/disabling the last one. */
function otherActiveAdmins(exceptId: string): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(staff)
    .where(and(eq(staff.role, 'admin'), eq(staff.status, 'active'), ne(staff.id, exceptId)))
    .get();
  return row?.n ?? 0;
}

export interface InviteResult {
  member: StaffMember;
  token: string;
}

/** Create an `invited` row (no password yet) and return its accept token. */
export function inviteStaff(email: string, role: StaffRole): InviteResult {
  const normalized = email.toLowerCase().trim();
  if (db.select().from(staff).where(eq(staff.email, normalized)).get()) {
    throw new AppError('email_taken', 409);
  }
  const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
  const row: Staff = {
    id: randomUUID(),
    email: normalized,
    passwordHash: null,
    name: '',
    role,
    status: 'invited',
    inviteToken: token,
    lastLoginAt: null,
    lastSeenAt: null,
    createdAt: new Date(),
  };
  db.insert(staff).values(row).run();
  return { member: toMember(row), token };
}

export function setRole(id: string, role: StaffRole): StaffMember {
  const row = getOrThrow(id);
  if (row.role === 'admin' && role === 'agent' && otherActiveAdmins(id) === 0) {
    throw new AppError('last_admin', 409);
  }
  db.update(staff).set({ role }).where(eq(staff.id, id)).run();
  return toMember(getOrThrow(id));
}

export function setStatus(id: string, status: 'active' | 'disabled'): StaffMember {
  const row = getOrThrow(id);
  if (row.status === 'invited') throw new AppError('invite_pending', 409);
  if (status === 'disabled' && row.role === 'admin' && otherActiveAdmins(id) === 0) {
    throw new AppError('last_admin', 409);
  }
  db.update(staff).set({ status }).where(eq(staff.id, id)).run();
  return toMember(getOrThrow(id));
}

/** Public preview of a pending invite by token — lets the accept page show
 *  which email the invite is for. Returns null for an unknown/used token. */
export function getInviteByToken(token: string): { email: string; role: StaffRole } | null {
  const row = db.select().from(staff).where(eq(staff.inviteToken, token)).get();
  if (!row || row.status !== 'invited') return null;
  return { email: row.email, role: row.role };
}

/** The accept token of a pending invite, so an admin can re-share the link. */
export function getInviteToken(id: string): string {
  const row = getOrThrow(id);
  if (row.status !== 'invited' || !row.inviteToken) throw new AppError('not_invited', 409);
  return row.inviteToken;
}

/** Hard-delete an invited (not-yet-accepted) staff row. Safe because an
 *  invited account has no related data — it never logged in, was never
 *  assigned a conversation, sent a message, or registered a device. Joined
 *  accounts must be disabled instead (setStatus). */
export function cancelInvite(id: string): void {
  const row = getOrThrow(id);
  if (row.status !== 'invited') throw new AppError('not_invited', 409);
  db.delete(staff).where(eq(staff.id, id)).run();
}

export interface AcceptedInvite {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
}

/** Accept an invite: set name + password, flip to `active`, clear the token. */
export async function acceptInvite(
  token: string,
  name: string,
  password: string,
): Promise<AcceptedInvite> {
  const found = db.select().from(staff).where(eq(staff.inviteToken, token)).get();
  if (!found || found.status !== 'invited') throw new AppError('invalid_invite', 400);
  const trimmed = name.trim();
  db.update(staff)
    .set({
      name: trimmed,
      passwordHash: await hashPassword(password),
      status: 'active',
      inviteToken: null,
      lastLoginAt: new Date(),
    })
    .where(eq(staff.id, found.id))
    .run();
  return { id: found.id, email: found.email, name: trimmed, role: found.role };
}
