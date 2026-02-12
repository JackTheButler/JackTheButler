/**
 * Email Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, settings } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { EmailService } from '@/services/email.js';

// Mock the app registry
vi.mock('@/apps/index.js', () => ({
  getAppRegistry: vi.fn(),
}));

import { getAppRegistry } from '@/apps/index.js';
const mockGetAppRegistry = vi.mocked(getAppRegistry);

describe('EmailService', () => {
  const service = new EmailService();

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clean up custom templates
    await db.delete(settings).where(eq(settings.key, 'email_templates'));
  });

  describe('renderTemplate', () => {
    it('should replace all {{placeholders}}', () => {
      const result = service.renderTemplate(
        'Hi {{name}}, click {{link}} to continue. From {{hotelName}}.',
        { name: 'John', link: 'https://example.com', hotelName: 'Grand Hotel' }
      );

      expect(result).toBe('Hi John, click https://example.com to continue. From Grand Hotel.');
    });

    it('should leave unknown placeholders untouched', () => {
      const result = service.renderTemplate('Hi {{name}}, {{unknown}} here.', {
        name: 'John',
      });

      expect(result).toBe('Hi John, {{unknown}} here.');
    });

    it('should handle template with no placeholders', () => {
      const result = service.renderTemplate('No placeholders here.', { name: 'John' });

      expect(result).toBe('No placeholders here.');
    });
  });

  describe('getEmailProvider (via send methods)', () => {
    it('should log warning and not throw when no provider configured', async () => {
      // Mock registry with no active email channels
      mockGetAppRegistry.mockReturnValue({
        getActiveChannelAdapters: () => new Map(),
      } as ReturnType<typeof getAppRegistry>);

      // Should not throw
      await service.sendPasswordResetEmail('test@test.com', 'Test', 'token123');
    });

    it('should call provider sendEmail with correct arguments', async () => {
      const mockSendEmail = vi.fn().mockResolvedValue({ messageId: '123', status: 'sent' });

      mockGetAppRegistry.mockReturnValue({
        getActiveChannelAdapters: () =>
          new Map([['email-mailgun', { sendEmail: mockSendEmail }]]),
      } as unknown as ReturnType<typeof getAppRegistry>);

      await service.sendPasswordResetEmail('user@test.com', 'Alice', 'resettoken123');

      expect(mockSendEmail).toHaveBeenCalledOnce();
      const call = mockSendEmail.mock.calls[0][0];
      expect(call.to).toBe('user@test.com');
      expect(call.subject).toBe('Reset your password');
      expect(call.text).toContain('Alice');
      expect(call.text).toContain('resettoken123');
    });
  });

  describe('email verification', () => {
    it('should send verification email with correct link', async () => {
      const mockSendEmail = vi.fn().mockResolvedValue({ messageId: '123', status: 'sent' });

      mockGetAppRegistry.mockReturnValue({
        getActiveChannelAdapters: () =>
          new Map([['email-mailgun', { sendEmail: mockSendEmail }]]),
      } as unknown as ReturnType<typeof getAppRegistry>);

      await service.sendEmailVerificationEmail('user@test.com', 'Bob', 'verifytoken456');

      expect(mockSendEmail).toHaveBeenCalledOnce();
      const call = mockSendEmail.mock.calls[0][0];
      expect(call.subject).toBe('Verify your email');
      expect(call.text).toContain('Bob');
      expect(call.text).toContain('verifytoken456');
    });
  });

  describe('approval emails', () => {
    it('should send approval request email', async () => {
      const mockSendEmail = vi.fn().mockResolvedValue({ messageId: '123', status: 'sent' });

      mockGetAppRegistry.mockReturnValue({
        getActiveChannelAdapters: () =>
          new Map([['email-sendgrid', { sendEmail: mockSendEmail }]]),
      } as unknown as ReturnType<typeof getAppRegistry>);

      await service.sendApprovalRequestEmail('admin@test.com', 'New User', 'new@test.com');

      expect(mockSendEmail).toHaveBeenCalledOnce();
      const call = mockSendEmail.mock.calls[0][0];
      expect(call.to).toBe('admin@test.com');
      expect(call.text).toContain('New User');
      expect(call.text).toContain('new@test.com');
    });

    it('should send approval result email for approved', async () => {
      const mockSendEmail = vi.fn().mockResolvedValue({ messageId: '123', status: 'sent' });

      mockGetAppRegistry.mockReturnValue({
        getActiveChannelAdapters: () =>
          new Map([['email-mailgun', { sendEmail: mockSendEmail }]]),
      } as unknown as ReturnType<typeof getAppRegistry>);

      await service.sendApprovalResultEmail('user@test.com', 'Alice', true);

      const call = mockSendEmail.mock.calls[0][0];
      expect(call.subject).toBe('Your account has been approved');
      expect(call.text).toContain('approved');
    });

    it('should send approval result email for rejected', async () => {
      const mockSendEmail = vi.fn().mockResolvedValue({ messageId: '123', status: 'sent' });

      mockGetAppRegistry.mockReturnValue({
        getActiveChannelAdapters: () =>
          new Map([['email-mailgun', { sendEmail: mockSendEmail }]]),
      } as unknown as ReturnType<typeof getAppRegistry>);

      await service.sendApprovalResultEmail('user@test.com', 'Alice', false);

      const call = mockSendEmail.mock.calls[0][0];
      expect(call.subject).toBe('Your account has been rejected');
      expect(call.text).toContain('rejected');
    });
  });

  describe('custom templates', () => {
    it('should use custom templates when stored in settings', async () => {
      const mockSendEmail = vi.fn().mockResolvedValue({ messageId: '123', status: 'sent' });

      mockGetAppRegistry.mockReturnValue({
        getActiveChannelAdapters: () =>
          new Map([['email-mailgun', { sendEmail: mockSendEmail }]]),
      } as unknown as ReturnType<typeof getAppRegistry>);

      // Store custom template
      await db.insert(settings).values({
        key: 'email_templates',
        value: JSON.stringify({
          passwordReset: {
            subject: 'Custom: Reset password for {{hotelName}}',
            body: 'Dear {{name}}, use this link: {{link}}',
          },
        }),
      });

      await service.sendPasswordResetEmail('user@test.com', 'Charlie', 'customtoken');

      const call = mockSendEmail.mock.calls[0][0];
      expect(call.subject).toContain('Custom:');
      expect(call.text).toBe('Dear Charlie, use this link: http://localhost:3000/reset-password?token=customtoken');
    });

    it('should fall back to defaults for missing template fields', async () => {
      const mockSendEmail = vi.fn().mockResolvedValue({ messageId: '123', status: 'sent' });

      mockGetAppRegistry.mockReturnValue({
        getActiveChannelAdapters: () =>
          new Map([['email-mailgun', { sendEmail: mockSendEmail }]]),
      } as unknown as ReturnType<typeof getAppRegistry>);

      // Store partial template (only passwordReset subject, no body)
      await db.insert(settings).values({
        key: 'email_templates',
        value: JSON.stringify({
          passwordReset: {
            subject: 'Custom subject',
          },
        }),
      });

      await service.sendPasswordResetEmail('user@test.com', 'Dave', 'tok');

      const call = mockSendEmail.mock.calls[0][0];
      expect(call.subject).toBe('Custom subject');
      // Body should use default since it wasn't customized
      expect(call.text).toContain('You requested a password reset');
    });
  });

  describe('error handling', () => {
    it('should not throw when provider sendEmail fails', async () => {
      const mockSendEmail = vi.fn().mockRejectedValue(new Error('Provider error'));

      mockGetAppRegistry.mockReturnValue({
        getActiveChannelAdapters: () =>
          new Map([['email-mailgun', { sendEmail: mockSendEmail }]]),
      } as unknown as ReturnType<typeof getAppRegistry>);

      // Should not throw
      await service.sendPasswordResetEmail('user@test.com', 'Test', 'token');
    });
  });
});
