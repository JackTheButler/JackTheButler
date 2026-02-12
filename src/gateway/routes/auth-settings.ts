/**
 * Auth Settings Routes
 *
 * API endpoints for managing authentication settings (registration, verification, approval)
 * and email templates.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, settings } from '@/db/index.js';
import { authSettingsService, type AuthSettings } from '@/services/auth-settings.js';
import type { EmailTemplates } from '@/services/email.js';
import { validateBody } from '../middleware/validator.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '@/core/permissions/index.js';

const updateSchema = z.object({
  registrationEnabled: z.boolean().optional(),
  emailVerification: z.enum(['instant', 'grace']).optional(),
  emailVerificationGraceDays: z.number().int().min(1).max(365).optional(),
  defaultRoleId: z.string().min(1).optional(),
  requireAdminApproval: z.boolean().optional(),
});

const emailTemplateSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(5000),
});

const emailTemplatesSchema = z.object({
  passwordReset: emailTemplateSchema.optional(),
  emailVerification: emailTemplateSchema.optional(),
  approvalRequest: emailTemplateSchema.optional(),
  approvalResult: emailTemplateSchema.optional(),
});

const TEMPLATES_SETTINGS_KEY = 'email_templates';

type Variables = {
  validatedBody: unknown;
  userId: string;
};

const authSettingsRoutes = new Hono<{ Variables: Variables }>();

// Apply auth to all routes
authSettingsRoutes.use('/*', requireAuth);

/**
 * GET /api/v1/settings/auth
 * Get current auth settings
 */
authSettingsRoutes.get('/', requirePermission(PERMISSIONS.ADMIN_VIEW), async (c) => {
  const authSettings = await authSettingsService.get();
  return c.json({ settings: authSettings });
});

/**
 * PUT /api/v1/settings/auth
 * Update auth settings
 */
authSettingsRoutes.put(
  '/',
  requirePermission(PERMISSIONS.ADMIN_MANAGE),
  validateBody(updateSchema),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof updateSchema>;

    // Filter out undefined values for exactOptionalPropertyTypes compatibility
    const input: Record<string, unknown> = {};
    if (body.registrationEnabled !== undefined) input.registrationEnabled = body.registrationEnabled;
    if (body.emailVerification !== undefined) input.emailVerification = body.emailVerification;
    if (body.emailVerificationGraceDays !== undefined) input.emailVerificationGraceDays = body.emailVerificationGraceDays;
    if (body.defaultRoleId !== undefined) input.defaultRoleId = body.defaultRoleId;
    if (body.requireAdminApproval !== undefined) input.requireAdminApproval = body.requireAdminApproval;

    const authSettings = await authSettingsService.update(input as Partial<AuthSettings>);
    return c.json({ settings: authSettings });
  }
);

/**
 * GET /api/v1/settings/auth/email-templates
 * Get email templates (custom + defaults)
 */
authSettingsRoutes.get(
  '/email-templates',
  requirePermission(PERMISSIONS.ADMIN_VIEW),
  async (c) => {
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, TEMPLATES_SETTINGS_KEY))
      .get();

    const templates: Partial<EmailTemplates> = row ? JSON.parse(row.value) : {};
    return c.json({ templates });
  }
);

/**
 * PUT /api/v1/settings/auth/email-templates
 * Update email templates
 */
authSettingsRoutes.put(
  '/email-templates',
  requirePermission(PERMISSIONS.ADMIN_MANAGE),
  validateBody(emailTemplatesSchema),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof emailTemplatesSchema>;

    // Load existing templates and merge
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, TEMPLATES_SETTINGS_KEY))
      .get();

    const existing: Partial<EmailTemplates> = row ? JSON.parse(row.value) : {};
    const merged = { ...existing, ...body };
    const value = JSON.stringify(merged);

    if (row) {
      await db
        .update(settings)
        .set({ value, updatedAt: new Date().toISOString() })
        .where(eq(settings.key, TEMPLATES_SETTINGS_KEY))
        .run();
    } else {
      await db.insert(settings).values({
        key: TEMPLATES_SETTINGS_KEY,
        value,
        updatedAt: new Date().toISOString(),
      }).run();
    }

    return c.json({ templates: merged });
  }
);

export { authSettingsRoutes };
