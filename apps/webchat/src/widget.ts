/**
 * Butler Chat Widget
 *
 * Creates a shadow DOM host, renders the chat panel,
 * wires up ConnectionManager + ActionManager, handles open/close animation.
 */

import { TYPING_TIMEOUT } from './constants.js';
import { ConnectionManager } from './connection.js';
import { ActionManager } from './actions.js';
import { getToken } from './session.js';
import { createChatPanel } from './components/chat-panel.js';
import { createChatHeader } from './components/chat-header.js';
import { createMessageList } from './components/message-list.js';
import { createInputBar } from './components/input-bar.js';
import { createTypingIndicator } from './components/typing-indicator.js';
import { createActionForm } from './components/action-form.js';

// Styles
import { themeStyles } from './styles/theme.js';
import { baseStyles } from './styles/base.js';
import { panelStyles } from './styles/panel.css.js';
import { headerStyles } from './styles/header.css.js';
import { messageStyles } from './styles/messages.css.js';
import { inputStyles } from './styles/input.css.js';
import { formStyles } from './styles/forms.css.js';
import { animationStyles } from './styles/animations.css.js';
import { responsiveStyles } from './styles/responsive.css.js';

import { darkenHex, hexToRgba, contrastText } from './utils.js';
import type { ButtonIcon, VerificationStatus, WidgetConfig, WidgetRemoteConfig } from './types.js';
import type { ActionForm as ActionFormType } from './components/action-form.js';

const ALL_STYLES = [
  themeStyles,
  baseStyles,
  panelStyles,
  headerStyles,
  messageStyles,
  inputStyles,
  formStyles,
  animationStyles,
  responsiveStyles,
].join('\n');

export class ButlerChatWidget {
  private hostEl: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private connection: ConnectionManager | null = null;
  private actionManager: ActionManager | null = null;
  private isOpen = false;
  private hasConnected = false;
  private verificationStatus: VerificationStatus = 'anonymous';
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private typingShownAt = 0;
  private currentForm: ActionFormType | null = null;

  // Components
  private panel = createChatPanel();
  private messageList = createMessageList();
  private typingIndicator = createTypingIndicator();
  private inputBar!: ReturnType<typeof createInputBar>;
  private header!: ReturnType<typeof createChatHeader>;

  constructor(private readonly config: WidgetConfig) {}

  async init(): Promise<void> {
    // Create host element on body
    this.hostEl = document.createElement('div');
    this.hostEl.id = 'butler-chat-root';
    document.body.appendChild(this.hostEl);

    // Create shadow DOM
    this.shadow = this.hostEl.attachShadow({ mode: 'open' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = ALL_STYLES;
    this.shadow.appendChild(style);

    // Fetch remote config and apply theme overrides
    await this.fetchAndApplyConfig();

    // Create components (apply pending remote config to header)
    this.header = createChatHeader(() => this.close(), this._pendingTitle, this._pendingLogo);
    this.inputBar = createInputBar((content) => this.handleSend(content));

    // Assemble panel
    this.panel.setContent(
      this.header.element,
      this.messageList.element,
      this.inputBar.element
    );

    this.shadow.appendChild(this.panel.element);

    // Create managers (but don't connect yet — lazy on first open)
    this.connection = new ConnectionManager(this.config.gatewayOrigin, {
      onSession: (msg) => {
        this.verificationStatus = msg.verificationStatus ?? 'anonymous';
        this.inputBar.setEnabled(true);

        if (msg.restored) {
          this.messageList.addMessage('Session restored.', 'system');
        } else if (msg.previousExpired) {
          this.messageList.addMessage('Previous session expired. Starting fresh.', 'system');
        }
      },
      onSessionUpdate: (msg) => {
        if (msg.verificationStatus) {
          this.verificationStatus = msg.verificationStatus;
          if (this.verificationStatus === 'verified') {
            this.actionManager?.onVerificationComplete();
          }
        }
      },
      onHistory: (msg) => {
        if (msg.messages?.length) {
          // Clear existing messages (handles mid-session restore after verification)
          this.messageList.clear();
          for (const m of msg.messages) {
            if (m.direction === 'inbound') {
              this.messageList.addMessage(m.content, 'guest', 'You');
            } else if (m.senderType === 'staff') {
              this.messageList.addMessage(m.content, 'staff', 'Staff');
            } else if (m.senderType === 'system') {
              this.messageList.addMessage(m.content, 'system');
            } else {
              this.messageList.addMessage(m.content, 'ai', 'AI');
            }
          }
        }
      },
      onMessage: (msg) => {
        this.hideTyping();

        if (msg.senderType === 'system') {
          this.messageList.addMessage(msg.content, 'system');
        } else if (msg.senderType === 'ai') {
          const qrOptions = msg.quickReplies?.length
            ? { quickReplies: msg.quickReplies, onQuickReply: (text: string) => this.handleSend(text) }
            : undefined;
          this.messageList.addMessage(msg.content, 'ai', 'AI', qrOptions);
          if (msg.action?.id) {
            this.actionManager?.handleActionTrigger(msg.action.id);
          }
        } else if (msg.senderType === 'staff') {
          this.messageList.addMessage(msg.content, 'staff', 'Staff');
        } else if (msg.direction === 'inbound') {
          this.messageList.addMessage(msg.content, 'guest', 'You');
        }
      },
      onError: (message) => {
        this.messageList.addMessage(`Error: ${message}`, 'system');
      },
      onConnected: () => {
        this.inputBar.setEnabled(true);
      },
      onDisconnected: () => {
        this.inputBar.setEnabled(false);
      },
    }, this.config.butlerKey);

    this.actionManager = new ActionManager(this.config.gatewayOrigin, {
      onShowForm: (actionId, fields, actionName, context, onSubmit, onCancel) => {
        this.removeCurrentForm();

        const form = createActionForm(
          actionName,
          fields,
          context,
          async (data) => {
            if (onSubmit) await onSubmit(data);
          },
          () => {
            this.removeCurrentForm();
            if (onCancel) onCancel();
          }
        );

        this.currentForm = form;
        // Insert form before typing indicator
        this.messageList.element.insertBefore(
          form.element,
          this.messageList.element.querySelector('.butler-messages-sentinel')
        );
        this.messageList.scrollToBottom();

        // Suppress the actionId unused warning
        void actionId;
      },
      onHideForm: () => {
        this.removeCurrentForm();
      },
      onSystemMessage: (content) => {
        this.messageList.addMessage(content, 'system');
      },
      getVerificationStatus: () => this.verificationStatus,
      getSessionToken: () => getToken(),
    });
  }

  private async fetchAndApplyConfig(): Promise<void> {
    try {
      const keyParam = this.config.butlerKey ? `?key=${this.config.butlerKey}` : '';
      const res = await fetch(`${this.config.gatewayOrigin}/api/v1/webchat/config${keyParam}`);
      if (!res.ok) return; // Silently fall back to defaults

      const cfg: WidgetRemoteConfig = await res.json();
      this.applyRemoteConfig(cfg);
    } catch {
      // Network error — fall back to defaults
    }
  }

  private applyRemoteConfig(cfg: WidgetRemoteConfig): void {
    if (!this.shadow) return;

    // Build CSS overrides for non-default values
    const overrides: string[] = [];

    // Dark theme — swap surface and text variables
    if (cfg.theme === 'dark') {
      overrides.push(`--butler-bg-panel: #1e1e2e`);
      overrides.push(`--butler-bg-messages: #181825`);
      overrides.push(`--butler-bg-bubble-ai: #2a2a3e`);
      overrides.push(`--butler-border-bubble-ai: #3a3a4e`);
      overrides.push(`--butler-bg-bubble-staff: #3a3520`);
      overrides.push(`--butler-border-bubble-staff: #6b5c1e`);
      overrides.push(`--butler-text-primary: #e0e0e0`);
      overrides.push(`--butler-text-secondary: #a0a0a0`);
      overrides.push(`--butler-text-light: #707070`);
      overrides.push(`--butler-border-color: #3a3a4e`);
      overrides.push(`--butler-shadow-panel: 0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)`);
    }

    if (cfg.primaryColor) {
      overrides.push(`--butler-color-primary: ${cfg.primaryColor}`);
      overrides.push(`--butler-color-primary-hover: ${darkenHex(cfg.primaryColor, 20)}`);
      overrides.push(`--butler-color-primary-light: ${hexToRgba(cfg.primaryColor, 0.1)}`);
      overrides.push(`--butler-bg-bubble-guest: ${cfg.primaryColor}`);
      overrides.push(`--butler-text-on-primary: ${contrastText(cfg.primaryColor)}`);
    }

    if (cfg.headerBackground) {
      overrides.push(`--butler-bg-header: ${cfg.headerBackground}`);
      // In dark mode, messages bg is already set above
      if (cfg.theme !== 'dark') {
        overrides.push(`--butler-bg-messages: ${hexToRgba(cfg.headerBackground, 0.04)}`);
      }
    }

    if (overrides.length > 0) {
      const overrideStyle = document.createElement('style');
      overrideStyle.textContent = `:host { ${overrides.join('; ')}; }`;
      this.shadow.appendChild(overrideStyle);
    }

    // Store values to apply in init after header creation
    this._pendingTitle = cfg.botName || undefined;
    this._pendingLogo = cfg.logoUrl || undefined;
    this._primaryColor = cfg.primaryColor || undefined;
    this._buttonIcon = (cfg.buttonIcon as ButtonIcon) || 'chat';
  }

  /** Pending config values applied after header creation */
  private _pendingTitle?: string;
  private _pendingLogo?: string;
  private _primaryColor?: string;
  private _buttonIcon: ButtonIcon = 'chat';

  /** Primary color from remote config (used by CTA button outside shadow DOM) */
  get primaryColor(): string | undefined {
    return this._primaryColor;
  }

  /** Button icon from remote config (used by CTA button outside shadow DOM) */
  get buttonIcon(): ButtonIcon {
    return this._buttonIcon;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    const panel = this.panel.element;
    panel.style.display = 'flex';

    // Trigger animation on next frame
    requestAnimationFrame(() => {
      panel.classList.add('butler-panel--open');
    });

    // Lazy connect on first open
    if (!this.hasConnected && this.connection) {
      this.hasConnected = true;
      this.actionManager?.fetchActions();
      this.connection.connect();
    }

    // After animation completes: focus input + ensure scrolled to bottom
    setTimeout(() => {
      this.inputBar.focus();
      this.messageList.scrollToBottom();
    }, 350);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;

    const panel = this.panel.element;
    panel.classList.remove('butler-panel--open');

    const onEnd = () => {
      panel.style.display = 'none';
      panel.removeEventListener('transitionend', onEnd);
    };
    panel.addEventListener('transitionend', onEnd);
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  destroy(): void {
    this.connection?.destroy();
    this.hostEl?.remove();
  }

  private handleSend(content: string): void {
    if (!this.connection?.isConnected()) return;

    this.connection.sendMessage(content);
    this.messageList.addMessage(content, 'guest', 'You');

    // Show typing indicator
    this.showTyping();
  }

  private showTyping(): void {
    this.typingShownAt = Date.now();
    // Move typing indicator to bottom of message list (before sentinel)
    const sentinel = this.messageList.element.querySelector('.butler-messages-sentinel');
    this.messageList.element.insertBefore(this.typingIndicator.element, sentinel);
    this.typingIndicator.show();
    this.messageList.scrollToBottom();

    // Failsafe timeout
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.doHideTyping(), TYPING_TIMEOUT);
  }

  private hideTyping(): void {
    // Ensure typing indicator is visible for at least 500ms
    const elapsed = Date.now() - this.typingShownAt;
    const remaining = Math.max(0, 500 - elapsed);

    if (remaining > 0) {
      if (this.typingTimer) clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => this.doHideTyping(), remaining);
    } else {
      this.doHideTyping();
    }
  }

  private doHideTyping(): void {
    this.typingIndicator.hide();
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
  }

  private removeCurrentForm(): void {
    if (this.currentForm) {
      this.currentForm.remove();
      this.currentForm = null;
    }
  }
}
