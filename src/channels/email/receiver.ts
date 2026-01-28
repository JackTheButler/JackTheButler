/**
 * Email Receiver (IMAP)
 *
 * Polls for new emails via IMAP and emits parsed messages.
 */

import Imap from 'imap';
import { EventEmitter } from 'events';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';
import { parseEmailMessage, type ParsedEmail } from './parser.js';

const log = createLogger('email:receiver');

/**
 * Email receiver events
 */
export interface EmailReceiverEvents {
  message: (email: ParsedEmail) => void;
  error: (error: Error) => void;
  connected: () => void;
  disconnected: () => void;
}

/**
 * Email receiver using IMAP
 */
export class EmailReceiver extends EventEmitter {
  private imap: Imap;
  private pollInterval: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;

  constructor(imapConfig: Imap.Config, pollInterval: number = 60) {
    super();
    this.imap = new Imap(imapConfig);
    this.pollInterval = pollInterval * 1000; // Convert to ms

    this.setupEventHandlers();
    log.info({ host: imapConfig.host, pollInterval }, 'Email receiver initialized');
  }

  private setupEventHandlers(): void {
    this.imap.on('ready', () => {
      this.isConnected = true;
      log.info('IMAP connection established');
      this.emit('connected');
      this.openInbox();
    });

    this.imap.on('error', (err: Error) => {
      log.error({ err }, 'IMAP error');
      this.emit('error', err);
    });

    this.imap.on('end', () => {
      this.isConnected = false;
      log.info('IMAP connection ended');
      this.emit('disconnected');
    });

    this.imap.on('close', (hadError: boolean) => {
      this.isConnected = false;
      if (hadError) {
        log.warn('IMAP connection closed with error');
      } else {
        log.debug('IMAP connection closed');
      }
      this.emit('disconnected');
    });
  }

  private openInbox(): void {
    this.imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        log.error({ err }, 'Failed to open INBOX');
        this.emit('error', err);
        return;
      }

      log.debug({ totalMessages: box.messages.total }, 'INBOX opened');

      // Start polling for new messages
      this.startPolling();
    });
  }

  /**
   * Start the email receiver
   */
  start(): void {
    if (this.isConnected) {
      log.warn('Email receiver already connected');
      return;
    }

    log.info('Connecting to IMAP server');
    this.imap.connect();
  }

  /**
   * Stop the email receiver
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.isConnected) {
      this.imap.end();
    }

    log.info('Email receiver stopped');
  }

  private startPolling(): void {
    // Check immediately
    this.checkForNewMessages();

    // Then poll at interval
    this.pollTimer = setInterval(() => {
      this.checkForNewMessages();
    }, this.pollInterval);

    log.debug({ intervalMs: this.pollInterval }, 'Started polling for new emails');
  }

  private checkForNewMessages(): void {
    if (!this.isConnected) {
      log.warn('Not connected, skipping message check');
      return;
    }

    // Search for unseen messages
    this.imap.search(['UNSEEN'], (err, uids) => {
      if (err) {
        log.error({ err }, 'Failed to search for new messages');
        return;
      }

      if (uids.length === 0) {
        log.debug('No new messages');
        return;
      }

      log.info({ count: uids.length }, 'Found new messages');

      // Fetch the messages
      this.fetchMessages(uids);
    });
  }

  private fetchMessages(uids: number[]): void {
    const fetch = this.imap.fetch(uids, {
      bodies: '',
      markSeen: true,
    });

    fetch.on('message', (msg, seqno) => {
      log.debug({ seqno }, 'Fetching message');

      let buffer = '';

      msg.on('body', (stream) => {
        stream.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
        });
      });

      msg.once('end', () => {
        this.processMessage(buffer, seqno);
      });
    });

    fetch.once('error', (err) => {
      log.error({ err }, 'Fetch error');
    });

    fetch.once('end', () => {
      log.debug('Done fetching messages');
    });
  }

  private async processMessage(rawEmail: string, seqno: number): Promise<void> {
    try {
      const parsed = await parseEmailMessage(rawEmail);

      log.info(
        {
          seqno,
          messageId: parsed.messageId,
          from: parsed.from?.address,
          subject: parsed.subject,
        },
        'Received email'
      );

      this.emit('message', parsed);
    } catch (error) {
      log.error({ err: error, seqno }, 'Failed to parse email');
    }
  }
}

/**
 * Cached receiver instance
 */
let cachedReceiver: EmailReceiver | null = null;

/**
 * Get or create the email receiver
 */
export function getEmailReceiver(): EmailReceiver | null {
  if (cachedReceiver) {
    return cachedReceiver;
  }

  const config = loadConfig();

  if (!config.email.imapHost || !config.email.imapUser) {
    log.debug('IMAP not configured');
    return null;
  }

  const imapConfig: Imap.Config = {
    host: config.email.imapHost,
    port: config.email.imapPort,
    tls: config.email.imapSecure,
    user: config.email.imapUser,
    password: config.email.imapPass || '',
    tlsOptions: { rejectUnauthorized: false },
  };

  cachedReceiver = new EmailReceiver(imapConfig, config.email.pollInterval);

  return cachedReceiver;
}

/**
 * Reset cached receiver (for testing)
 */
export function resetEmailReceiver(): void {
  if (cachedReceiver) {
    cachedReceiver.stop();
    cachedReceiver = null;
  }
}
