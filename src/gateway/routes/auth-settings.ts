/**
 * Auth Settings Routes
 *
 * API endpoints for managing authentication settings (registration, verification, approval)
 * and email templates.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authSettingsService, type AuthSettings } from '@/auth/auth-settings.js';
import { settingsService } from '@/services/settings.js';
import { TEMPLATES_SETTINGS_KEY, type EmailTemplates } from '@/services/email.js';
import { validateBody } from '../middleware/validator.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '@/core/permissions/index.js';
import { logConfigChange } from '@/services/audit.js';

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

    const userId = c.get('userId') as string;
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? undefined;
    logConfigChange(userId, 'system', 'auth-settings', input, { ip, userAgent: c.req.header('user-agent') ?? undefined }).catch(() => {});

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
    const templates = await settingsService.get<Partial<EmailTemplates>>(TEMPLATES_SETTINGS_KEY, {});
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

    const existing = await settingsService.get<Partial<EmailTemplates>>(TEMPLATES_SETTINGS_KEY, {});
    const merged = { ...existing, ...body };
    await settingsService.set(TEMPLATES_SETTINGS_KEY, merged);

    const userId = c.get('userId') as string;
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? undefined;
    logConfigChange(userId, 'system', 'email-templates', { updatedKeys: Object.keys(body) }, { ip, userAgent: c.req.header('user-agent') ?? undefined }).catch(() => {});

    return c.json({ templates: merged });
  }
);

export { authSettingsRoutes };
