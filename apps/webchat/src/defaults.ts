/**
 * Default widget strings (English fallback).
 *
 * Used when the config endpoint is unreachable or hasn't returned yet,
 * so the widget is still functional without a server connection.
 */

export interface WidgetStrings {
  inputPlaceholder: string;
  sendButton: string;
  closeChat: string;
  scrollToBottom: string;
  senderYou: string;
  senderAI: string;
  senderStaff: string;
  sessionRestored: string;
  sessionExpired: string;
  submit: string;
  cancel: string;
  submitting: string;
  fieldRequired: string;
  selectPlaceholder: string;
  verifyFirst: string;
  noSession: string;
  verificationCode: string;
  actionFailed: string;
  submitFailed: string;
}

export const DEFAULT_STRINGS: WidgetStrings = {
  inputPlaceholder: 'Type a message...',
  sendButton: 'Send message',
  closeChat: 'Close chat',
  scrollToBottom: 'Scroll to bottom',
  senderYou: 'You',
  senderAI: 'AI',
  senderStaff: 'Staff',
  sessionRestored: 'Session restored.',
  sessionExpired: 'Previous session expired. Starting fresh.',
  submit: 'Submit',
  cancel: 'Cancel',
  submitting: 'Submitting...',
  fieldRequired: '{{field}} is required',
  selectPlaceholder: 'Select {{field}}...',
  verifyFirst: 'Please verify your booking first.',
  noSession: 'No active session. Please refresh.',
  verificationCode: 'Verification Code',
  actionFailed: 'Action failed.',
  submitFailed: 'Failed to submit form. Please try again.',
};

/**
 * Replace {{key}} placeholders in a template string.
 */
export function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => params[key] ?? `{{${key}}}`);
}
