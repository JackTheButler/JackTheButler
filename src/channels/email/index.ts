/**
 * Email Channel Adapter
 *
 * Handles email message processing and sending via SMTP/IMAP.
 */

import type { ChannelAdapter, SendResult, ChannelMessagePayload } from '@/types/channel.js';
import { EmailSender, getEmailSender } from './sender.js';
import { EmailReceiver, getEmailReceiver } from './receiver.js';
import { type ParsedEmail, extractReplyContent } from './parser.js';
import { renderTemplate } from './templates.js';
import { MessageProcessor, getProcessor } from '@/pipeline/processor.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('email');

/**
 * Email channel adapter
 */
export class EmailAdapter implements ChannelAdapter {
  readonly channel = 'email' as const;
  private sender: EmailSender;
  private receiver: EmailReceiver | null;
  private processor: MessageProcessor;

  constructor(
    sender: EmailSender,
    receiver: EmailReceiver | null,
    processor: MessageProcessor
  ) {
    this.sender = sender;
    this.receiver = receiver;
    this.processor = processor;

    // Set up message handler for incoming emails
    if (this.receiver) {
      this.receiver.on('message', this.handleIncomingEmail.bind(this));
      this.receiver.on('error', (error) => {
        log.error({ err: error }, 'Email receiver error');
      });
    }

    log.info('Email adapter initialized');
  }

  /**
   * Start listening for incoming emails
   */
  start(): void {
    if (this.receiver) {
      this.receiver.start();
      log.info('Email adapter started');
    } else {
      log.warn('Email receiver not configured, only sending is available');
    }
  }

  /**
   * Stop listening for incoming emails
   */
  stop(): void {
    if (this.receiver) {
      this.receiver.stop();
      log.info('Email adapter stopped');
    }
  }

  /**
   * Handle an incoming email message
   */
  private async handleIncomingEmail(email: ParsedEmail): Promise<void> {
    if (!email.from?.address) {
      log.warn({ messageId: email.messageId }, 'Received email without from address');
      return;
    }

    log.info(
      {
        messageId: email.messageId,
        from: email.from.address,
        subject: email.subject,
      },
      'Processing incoming email'
    );

    // Extract the reply content (remove quoted text)
    const bodyText = email.textBody || '';
    const content = extractReplyContent(bodyText) || bodyText;

    if (!content.trim()) {
      log.info({ messageId: email.messageId }, 'Email has no text content, skipping');
      return;
    }

    // Create inbound message
    const inbound = {
      id: email.messageId,
      channel: 'email' as const,
      channelId: email.from.address,
      content,
      contentType: 'text' as const,
      timestamp: email.date,
      raw: email,
    };

    try {
      // Process through pipeline
      const response = await this.processor.process(inbound);

      // Send response
      await this.sendReply(email.from.address, response.content, email);

      log.info({ messageId: email.messageId }, 'Email processed successfully');
    } catch (error) {
      log.error({ err: error, messageId: email.messageId }, 'Failed to process email');

      // Send error response
      const errorMessage =
        "I'm sorry, I encountered an error processing your request. Please try again or contact the front desk for assistance.";
      await this.sendReply(email.from.address, errorMessage, email);
    }
  }

  /**
   * Send a reply email
   */
  private async sendReply(
    to: string,
    content: string,
    originalEmail: ParsedEmail
  ): Promise<SendResult> {
    // Build references chain
    const references = [...originalEmail.references];
    if (originalEmail.messageId && !references.includes(originalEmail.messageId)) {
      references.push(originalEmail.messageId);
    }

    // Generate subject
    const subject = originalEmail.subject.startsWith('Re:')
      ? originalEmail.subject
      : `Re: ${originalEmail.subject}`;

    // Render HTML template
    const html = renderTemplate('reply', { content });

    const result = await this.sender.send({
      to,
      subject,
      text: content,
      html,
      inReplyTo: originalEmail.messageId,
      references,
    });

    return {
      channelMessageId: result.messageId,
      status: 'sent',
    };
  }

  /**
   * Send an email message (for outbound use)
   */
  async send(to: string, message: ChannelMessagePayload): Promise<SendResult> {
    const html = renderTemplate('reply', { content: message.content });

    const result = await this.sender.send({
      to,
      subject: 'Message from Jack The Butler',
      text: message.content,
      html,
    });

    return {
      channelMessageId: result.messageId,
      status: 'sent',
    };
  }
}

/**
 * Cached adapter instance
 */
let cachedAdapter: EmailAdapter | null = null;

/**
 * Get the email adapter
 */
export function getEmailAdapter(): EmailAdapter | null {
  if (cachedAdapter) {
    return cachedAdapter;
  }

  // Need at least sender configured
  const sender = getEmailSender();
  if (!sender) {
    log.debug('Email sender not configured');
    return null;
  }

  // Receiver is optional
  const receiver = getEmailReceiver();

  const processor = getProcessor();
  cachedAdapter = new EmailAdapter(sender, receiver, processor);

  return cachedAdapter;
}

/**
 * Reset cached adapter (for testing)
 */
export function resetEmailAdapter(): void {
  if (cachedAdapter) {
    cachedAdapter.stop();
    cachedAdapter = null;
  }
}

// Re-export types and utilities
export { EmailSender, getEmailSender, resetEmailSender } from './sender.js';
export { EmailReceiver, getEmailReceiver, resetEmailReceiver } from './receiver.js';
export { parseEmailMessage, extractReplyContent, type ParsedEmail, type EmailAddress } from './parser.js';
export { renderTemplate, clearTemplateCache } from './templates.js';
