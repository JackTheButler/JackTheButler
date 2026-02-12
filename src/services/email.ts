/**
 * Transactional Email Service
 *
 * Sends transactional emails (password reset, email verification, etc.)
 * via the configured email channel app.
 *
 * @module services/email
 */

import { eq } from 'drizzle-orm';
import { db, settings } from '@/db/index.js';
import { getAppRegistry } from '@/apps/index.js';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('email');

// ===================
// Types
// ===================

/** Minimal interface for email sending capability */
interface EmailSender {
  sendEmail(options: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<{ messageId: string; status: string }>;
}

interface EmailTemplate {
  subject: string;
  body: string;
}

export interface EmailTemplates {
  passwordReset: EmailTemplate;
  emailVerification: EmailTemplate;
  approvalRequest: EmailTemplate;
  approvalResult: EmailTemplate;
}

// ===================
// Constants
// ===================

const TEMPLATES_SETTINGS_KEY = 'email_templates';

/** Email app IDs that support sendEmail */
const EMAIL_APP_IDS = ['email-mailgun', 'email-sendgrid', 'email-smtp', 'email-gmail-smtp'];

const DEFAULT_TEMPLATES: EmailTemplates = {
  passwordReset: {
    subject: 'Reset your password',
    body: 'Hi {{name}},\n\nYou requested a password reset. Click the link below to set a new password:\n\n{{link}}\n\nThis link expires in 1 hour. If you did not request this, you can safely ignore this email.\n\nBest regards,\n{{hotelName}}',
  },
  emailVerification: {
    subject: 'Verify your email',
    body: 'Hi {{name}},\n\nPlease verify your email address by clicking the link below:\n\n{{link}}\n\nThis link expires in 7 days.\n\nBest regards,\n{{hotelName}}',
  },
  approvalRequest: {
    subject: 'New account pending approval',
    body: 'Hi,\n\n{{newUserName}} ({{newUserEmail}}) has registered and is waiting for approval.\n\nPlease review their account in the dashboard.\n\nBest regards,\n{{hotelName}}',
  },
  approvalResult: {
    subject: 'Your account has been {{status}}',
    body: 'Hi {{name}},\n\nYour account has been {{status}}.\n\nBest regards,\n{{hotelName}}',
  },
};

// ===================
// Service
// ===================

export class EmailService {
  /**
   * Get the base URL for links in emails
   */
  private getBaseUrl(): string {
    const config = loadConfig();
    return process.env.APP_URL || `http://localhost:${config.port}`;
  }

  /**
   * Get the hotel name from settings for email templates
   */
  private async getHotelName(): Promise<string> {
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'hotel_profile'))
      .get();

    if (row) {
      try {
        const profile = JSON.parse(row.value);
        if (profile.name) return profile.name;
      } catch {
        // Fall through to default
      }
    }

    return 'Hotel';
  }

  /**
   * Get the first active email provider from the registry
   */
  private getEmailProvider(): EmailSender | null {
    const registry = getAppRegistry();
    const activeChannels = registry.getActiveChannelAdapters();

    for (const appId of EMAIL_APP_IDS) {
      const adapter = activeChannels.get(appId);
      if (adapter && typeof (adapter as unknown as EmailSender).sendEmail === 'function') {
        return adapter as unknown as EmailSender;
      }
    }

    return null;
  }

  /**
   * Load email templates from settings, falling back to defaults
   */
  private async getTemplates(): Promise<EmailTemplates> {
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, TEMPLATES_SETTINGS_KEY))
      .get();

    if (!row) return DEFAULT_TEMPLATES;

    try {
      const custom = JSON.parse(row.value) as Partial<EmailTemplates>;
      return {
        passwordReset: { ...DEFAULT_TEMPLATES.passwordReset, ...custom.passwordReset },
        emailVerification: { ...DEFAULT_TEMPLATES.emailVerification, ...custom.emailVerification },
        approvalRequest: { ...DEFAULT_TEMPLATES.approvalRequest, ...custom.approvalRequest },
        approvalResult: { ...DEFAULT_TEMPLATES.approvalResult, ...custom.approvalResult },
      };
    } catch {
      log.warn('Failed to parse email templates, using defaults');
      return DEFAULT_TEMPLATES;
    }
  }

  /**
   * Replace {{variable}} placeholders in a template string
   */
  renderTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      return variables[key] ?? match;
    });
  }

  /**
   * Send a password reset email
   */
  async sendPasswordResetEmail(to: string, name: string, resetToken: string): Promise<void> {
    const provider = this.getEmailProvider();
    if (!provider) {
      log.warn({ to }, 'No email provider configured, skipping password reset email');
      return;
    }

    const templates = await this.getTemplates();
    const hotelName = await this.getHotelName();
    const baseUrl = this.getBaseUrl();
    const link = `${baseUrl}/reset-password?token=${resetToken}`;

    const variables = { name, link, hotelName };
    const subject = this.renderTemplate(templates.passwordReset.subject, variables);
    const text = this.renderTemplate(templates.passwordReset.body, variables);

    try {
      await provider.sendEmail({ to, subject, text });
      log.info({ to }, 'Password reset email sent');
    } catch (error) {
      log.error({ error, to }, 'Failed to send password reset email');
    }
  }

  /**
   * Send an email verification email
   */
  async sendEmailVerificationEmail(
    to: string,
    name: string,
    verifyToken: string
  ): Promise<void> {
    const provider = this.getEmailProvider();
    if (!provider) {
      log.warn({ to }, 'No email provider configured, skipping verification email');
      return;
    }

    const templates = await this.getTemplates();
    const hotelName = await this.getHotelName();
    const baseUrl = this.getBaseUrl();
    const link = `${baseUrl}/verify-email?token=${verifyToken}`;

    const variables = { name, link, hotelName };
    const subject = this.renderTemplate(templates.emailVerification.subject, variables);
    const text = this.renderTemplate(templates.emailVerification.body, variables);

    try {
      await provider.sendEmail({ to, subject, text });
      log.info({ to }, 'Email verification email sent');
    } catch (error) {
      log.error({ error, to }, 'Failed to send email verification email');
    }
  }

  /**
   * Send an approval request email to an admin
   */
  async sendApprovalRequestEmail(
    adminEmail: string,
    newUserName: string,
    newUserEmail: string
  ): Promise<void> {
    const provider = this.getEmailProvider();
    if (!provider) {
      log.warn({ adminEmail }, 'No email provider configured, skipping approval request email');
      return;
    }

    const templates = await this.getTemplates();
    const hotelName = await this.getHotelName();

    const variables = { newUserName, newUserEmail, hotelName };
    const subject = this.renderTemplate(templates.approvalRequest.subject, variables);
    const text = this.renderTemplate(templates.approvalRequest.body, variables);

    try {
      await provider.sendEmail({ to: adminEmail, subject, text });
      log.info({ adminEmail, newUserEmail }, 'Approval request email sent');
    } catch (error) {
      log.error({ error, adminEmail }, 'Failed to send approval request email');
    }
  }

  /**
   * Send an approval result email to a user
   */
  async sendApprovalResultEmail(
    to: string,
    name: string,
    approved: boolean
  ): Promise<void> {
    const provider = this.getEmailProvider();
    if (!provider) {
      log.warn({ to }, 'No email provider configured, skipping approval result email');
      return;
    }

    const templates = await this.getTemplates();
    const hotelName = await this.getHotelName();
    const status = approved ? 'approved' : 'rejected';

    const variables = { name, status, hotelName };
    const subject = this.renderTemplate(templates.approvalResult.subject, variables);
    const text = this.renderTemplate(templates.approvalResult.body, variables);

    try {
      await provider.sendEmail({ to, subject, text });
      log.info({ to, approved }, 'Approval result email sent');
    } catch (error) {
      log.error({ error, to }, 'Failed to send approval result email');
    }
  }
}

export const emailService = new EmailService();
