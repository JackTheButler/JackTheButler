/**
 * Email Parser
 *
 * Parses raw email messages into a structured format.
 */

import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('email:parser');

/**
 * Email address structure
 */
export interface EmailAddress {
  name?: string;
  address: string;
}

/**
 * Parsed email structure
 */
export interface ParsedEmail {
  messageId: string;
  from: EmailAddress | null;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  date: Date;
  textBody: string | null;
  htmlBody: string | null;
  inReplyTo: string | null;
  references: string[];
  attachments: EmailAttachment[];
  raw: ParsedMail;
}

/**
 * Email attachment structure
 */
export interface EmailAttachment {
  filename: string | null;
  contentType: string;
  size: number;
  content: Buffer;
}

/**
 * Extract address from mailparser AddressObject
 */
function extractAddress(addressObj: AddressObject | undefined): EmailAddress | null {
  if (!addressObj || !addressObj.value || addressObj.value.length === 0) {
    return null;
  }

  const first = addressObj.value[0];
  if (!first) {
    return null;
  }

  const result: EmailAddress = {
    address: first.address || '',
  };

  if (first.name) {
    result.name = first.name;
  }

  return result;
}

/**
 * Extract addresses array from mailparser AddressObject
 */
function extractAddresses(addressObj: AddressObject | undefined): EmailAddress[] {
  if (!addressObj || !addressObj.value) {
    return [];
  }

  return addressObj.value.map((addr) => {
    const result: EmailAddress = {
      address: addr.address || '',
    };

    if (addr.name) {
      result.name = addr.name;
    }

    return result;
  });
}

/**
 * Parse raw email content into structured format
 */
export async function parseEmailMessage(rawEmail: string): Promise<ParsedEmail> {
  const parsed = await simpleParser(rawEmail);

  // Extract references (can be string or array)
  let references: string[] = [];
  if (parsed.references) {
    references = Array.isArray(parsed.references) ? parsed.references : [parsed.references];
  }

  // Process attachments
  const attachments: EmailAttachment[] = (parsed.attachments || []).map((att) => ({
    filename: att.filename || null,
    contentType: att.contentType,
    size: att.size,
    content: att.content,
  }));

  const email: ParsedEmail = {
    messageId: parsed.messageId || `generated-${Date.now()}`,
    from: extractAddress(parsed.from),
    to: extractAddresses(parsed.to as AddressObject | undefined),
    cc: extractAddresses(parsed.cc as AddressObject | undefined),
    subject: parsed.subject || '(No Subject)',
    date: parsed.date || new Date(),
    textBody: parsed.text || null,
    htmlBody: parsed.html || null,
    inReplyTo: parsed.inReplyTo || null,
    references,
    attachments,
    raw: parsed,
  };

  log.debug(
    {
      messageId: email.messageId,
      from: email.from?.address,
      subject: email.subject,
      hasText: !!email.textBody,
      hasHtml: !!email.htmlBody,
      attachmentCount: attachments.length,
    },
    'Parsed email'
  );

  return email;
}

/**
 * Extract the reply content from an email body.
 * Attempts to remove quoted previous messages.
 */
export function extractReplyContent(body: string): string {
  if (!body) {
    return '';
  }

  // Common patterns that indicate quoted content
  const quotePatterns = [
    /^>.*$/gm, // Lines starting with >
    /^On .* wrote:$/gm, // "On date, person wrote:"
    /^-{3,}.*Original Message.*-{3,}$/gim, // "--- Original Message ---"
    /^From:.*$/gm, // "From: someone"
    /^Sent:.*$/gm, // "Sent: date"
    /^_{5,}$/gm, // Underline separators
  ];

  let cleanBody = body;

  // Find the first occurrence of any quote pattern
  let earliestQuoteIndex = cleanBody.length;

  for (const pattern of quotePatterns) {
    const match = cleanBody.match(pattern);
    if (match && match.index !== undefined && match.index < earliestQuoteIndex) {
      earliestQuoteIndex = match.index;
    }
  }

  // Take only content before the quoted section
  if (earliestQuoteIndex < cleanBody.length) {
    cleanBody = cleanBody.substring(0, earliestQuoteIndex);
  }

  // Clean up whitespace
  cleanBody = cleanBody.trim();

  log.debug(
    {
      originalLength: body.length,
      cleanedLength: cleanBody.length,
    },
    'Extracted reply content'
  );

  return cleanBody;
}
