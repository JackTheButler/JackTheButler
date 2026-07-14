import { eq } from 'drizzle-orm';
import { db } from '@/db/client.js';
import { staff } from '@/db/schema/index.js';
import { AppError } from '@/core/errors.js';
import { hashPassword, verifyPassword } from '@/modules/auth/password.js';
import { loadSessionUser, type PublicUser } from '@/modules/auth/service.js';

/** Self-service account management for the logged-in staff member (any role).
 *  Distinct from the admin-only staff module — these only touch your own row. */

export function updateName(id: string, name: string): PublicUser {
  db.update(staff).set({ name: name.trim() }).where(eq(staff.id, id)).run();
  const user = loadSessionUser(id);
  if (!user) throw new AppError('staff_not_found', 404);
  return user;
}

export async function changePassword(
  id: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const row = db.select().from(staff).where(eq(staff.id, id)).get();
  if (!row || !row.passwordHash) throw new AppError('staff_not_found', 404);
  if (!(await verifyPassword(currentPassword, row.passwordHash))) {
    throw new AppError('invalid_password', 400);
  }
  db.update(staff)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(staff.id, id))
    .run();
}
