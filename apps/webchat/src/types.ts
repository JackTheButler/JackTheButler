/**
 * WebChat Widget Types
 *
 * Mirrors server-side types from src/services/webchat-action.ts
 */

// ============================================
// Action types (mirror server)
// ============================================

export interface WebChatAction {
  id: string;
  name: string;
  triggerHint: string;
  requiresVerification: boolean;
  fields: WebChatActionField[];
}

export interface WebChatActionField {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select' | 'email' | 'tel';
  required: boolean;
  options?: string[];
  placeholder?: string;
  validation?: string;
  showWhen?: {
    field: string;
    values: string[];
  };
}

export interface ActionResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
  nextStep?: {
    fields: WebChatActionField[];
    context: Record<string, string>;
  };
}

// ============================================
// WebSocket message types (server → widget)
// ============================================

export interface SessionMessage {
  type: 'session';
  token: string;
  sessionId: string;
  verificationStatus: VerificationStatus;
  restored?: boolean;
  previousExpired?: boolean;
}

export interface SessionUpdateMessage {
  type: 'session_update';
  verificationStatus?: VerificationStatus;
}

export interface HistoryMessage {
  type: 'history';
  messages: Array<{
    content: string;
    direction: 'inbound' | 'outbound';
    senderType?: 'ai' | 'staff' | 'system';
  }>;
}

export interface ChatMessage {
  type: 'message';
  content: string;
  direction?: 'inbound' | 'outbound';
  senderType?: 'ai' | 'staff' | 'system';
  action?: { id: string };
  quickReplies?: string[];
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface PongMessage {
  type: 'pong';
}

export type ServerMessage =
  | SessionMessage
  | SessionUpdateMessage
  | HistoryMessage
  | ChatMessage
  | ErrorMessage
  | PongMessage;

// ============================================
// Widget types
// ============================================

export type MessageVariant = 'guest' | 'ai' | 'staff' | 'system';

export type VerificationStatus = 'anonymous' | 'verified';

export interface WidgetConfig {
  gatewayOrigin: string;
  butlerKey?: string;
}

export type ButtonIcon = 'chat' | 'bell' | 'dots' | 'headset';

export interface WidgetRemoteConfig {
  theme: 'light' | 'dark';
  buttonIcon: ButtonIcon;
  botName: string;
  primaryColor: string;
  headerBackground: string;
  logoUrl: string | null;
  welcomeMessage: string | null;
}
