import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client.js';
import { staff, type Staff } from '@/db/schema/index.js';
import { AppError } from '@/core/errors.js';
import { hashPassword, verifyPassword } from '@/modules/auth/password.js';

/** Transport-agnostic auth logic. No HTTP here — callable from routes,
 *  and later from any other entry point. Errors are thrown as AppError. */

export type StaffRole = 'admin' | 'agent';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
}

const toPublic = (s: Staff): PublicUser => ({
  id: s.id,
  email: s.email,
  name: s.name,
  role: s.role,
});

export function staffCount(): number {
  const row = db.select({ n: sql<number>`count(*)` }).from(staff).get();
  return row?.n ?? 0;
}

export function needsSetup(): boolean {
  return staffCount() === 0;
}

/** Create the first admin. Only valid while no staff exist. */
export async function createInitialAdmin(input: {
  email: string;
  password: string;
  name: string;
}): Promise<PublicUser> {
  if (staffCount() > 0) throw new AppError('setup_already_done', 409);
  const now = new Date();
  const row: Staff = {
    id: randomUUID(),
    email: input.email.toLowerCase().trim(),
    passwordHash: await hashPassword(input.password),
    name: input.name.trim(),
    role: 'admin',
    status: 'active',
    inviteToken: null,
    lastLoginAt: now,
    lastSeenAt: null,
    createdAt: now,
  };
  db.insert(staff).values(row).run();
  return toPublic(row);
}

/** Verify credentials. Only `active` staff with a password can log in
 *  (`invited`/`disabled` are rejected). Stamps `lastLoginAt` on success. */
export async function authenticate(email: string, password: string): Promise<PublicUser> {
  const found = db
    .select()
    .from(staff)
    .where(eq(staff.email, email.toLowerCase().trim()))
    .get();
  if (!found || found.status !== 'active' || !found.passwordHash) {
    throw new AppError('invalid_credentials', 401);
  }
  if (!(await verifyPassword(password, found.passwordHash))) {
    throw new AppError('invalid_credentials', 401);
  }
  db.update(staff).set({ lastLoginAt: new Date() }).where(eq(staff.id, found.id)).run();
  return toPublic(found);
}

/** Resolve the current session's user from the DB on each request — gives
 *  fresh role and lets a `disabled` account lose access immediately (its
 *  existing cookie stops working). Returns null if missing or not active. */
export function loadSessionUser(id: string): PublicUser | null {
  const found = db.select().from(staff).where(eq(staff.id, id)).get();
  if (!found || found.status !== 'active') return null;
  return toPublic(found);
}
