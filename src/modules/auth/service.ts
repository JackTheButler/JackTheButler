import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client.js';
import { staff, type Staff } from '@/db/schema/index.js';
import { AppError } from '@/core/errors.js';
import { hashPassword, verifyPassword } from '@/modules/auth/password.js';

/** Transport-agnostic auth logic. No HTTP here — callable from routes,
 *  and later from any other entry point. Errors are thrown as AppError. */

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

const toPublic = (s: Staff): PublicUser => ({ id: s.id, email: s.email, name: s.name });

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
  const row: Staff = {
    id: randomUUID(),
    email: input.email.toLowerCase().trim(),
    passwordHash: await hashPassword(input.password),
    name: input.name.trim(),
    createdAt: new Date(),
  };
  db.insert(staff).values(row).run();
  return toPublic(row);
}

/** Verify credentials. Throws on failure; returns the public user on success. */
export async function authenticate(email: string, password: string): Promise<PublicUser> {
  const found = db
    .select()
    .from(staff)
    .where(eq(staff.email, email.toLowerCase().trim()))
    .get();
  const ok = found && (await verifyPassword(password, found.passwordHash));
  if (!found || !ok) throw new AppError('invalid_credentials', 401);
  return toPublic(found);
}
