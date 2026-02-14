/**
 * Action Manager
 *
 * Handles fetching action definitions, verification chaining,
 * form submission, and multi-step action flows.
 * Ported from test.html lines 74-342.
 */

import type {
  WebChatAction,
  WebChatActionField,
  ActionResult,
  VerificationStatus,
} from './types.js';
import type { WidgetStrings } from './defaults.js';

export interface ActionCallbacks {
  onShowForm(
    actionId: string,
    fields: WebChatActionField[],
    actionName: string,
    context?: Record<string, string>,
    onSubmit?: (data: Record<string, string>) => Promise<void>,
    onCancel?: () => void
  ): void;
  onHideForm(): void;
  onSystemMessage(content: string): void;
  getVerificationStatus(): VerificationStatus;
  getSessionToken(): string | null;
}

export class ActionManager {
  private actions: WebChatAction[] = [];
  private pendingActionId: string | null = null;
  private nextStepContext: Record<string, string> | null = null;

  constructor(
    private readonly gatewayOrigin: string,
    private strings: WidgetStrings,
    private locale: string,
    private readonly callbacks: ActionCallbacks
  ) {}

  setStrings(strings: WidgetStrings): void {
    this.strings = strings;
  }

  setLocale(locale: string): void {
    this.locale = locale;
  }

  async fetchActions(): Promise<void> {
    try {
      const qs = this.locale ? `?locale=${encodeURIComponent(this.locale)}` : '';
      const res = await fetch(`${this.gatewayOrigin}/api/v1/webchat/actions${qs}`);
      if (res.ok) {
        const json = await res.json();
        this.actions = json.actions ?? [];
      }
    } catch {
      // Actions unavailable — widget still works for chat
    }
  }

  getAction(actionId: string): WebChatAction | undefined {
    return this.actions.find((a) => a.id === actionId);
  }

  /**
   * Called when the AI triggers an action.
   * Handles verification chaining automatically.
   */
  handleActionTrigger(actionId: string): void {
    const action = this.getAction(actionId);
    if (!action) return;

    if (action.requiresVerification && this.callbacks.getVerificationStatus() !== 'verified') {
      this.pendingActionId = actionId;
      this.callbacks.onSystemMessage(this.strings.verifyFirst);
      this.showActionForm('verify-reservation');
    } else {
      this.showActionForm(actionId);
    }
  }

  /**
   * Called when verification status changes.
   * Shows the pending action form if there is one.
   */
  onVerificationComplete(): void {
    if (this.pendingActionId) {
      const pending = this.pendingActionId;
      this.pendingActionId = null;
      setTimeout(() => this.showActionForm(pending), 300);
    }
  }

  clearPending(): void {
    this.pendingActionId = null;
    this.nextStepContext = null;
  }

  private showActionForm(
    actionId: string,
    overrideFields?: WebChatActionField[],
    context?: Record<string, string>
  ): void {
    const action = this.getAction(actionId);
    if (!action && !overrideFields) return;

    const fields = overrideFields ?? action!.fields;
    const actionName = action?.name ?? this.strings.verificationCode;

    this.callbacks.onShowForm(
      actionId,
      fields,
      actionName,
      context,
      async (data) => {
        await this.submitAction(actionId, data, context);
      },
      () => {
        this.callbacks.onHideForm();
        this.pendingActionId = null;
        this.nextStepContext = null;
      }
    );
  }

  private async submitAction(
    actionId: string,
    data: Record<string, string>,
    context?: Record<string, string>
  ): Promise<void> {
    const token = this.callbacks.getSessionToken();
    if (!token) {
      this.callbacks.onSystemMessage(this.strings.noSession);
      this.callbacks.onHideForm();
      return;
    }

    // Merge context from previous step
    const body = context ? { ...context, ...data } : data;

    try {
      const res = await fetch(
        `${this.gatewayOrigin}/api/v1/webchat/actions/${actionId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      );

      const result: ActionResult = await res.json();
      this.callbacks.onHideForm();

      if (result.success) {
        if (result.nextStep) {
          this.callbacks.onSystemMessage(result.message);
          this.nextStepContext = result.nextStep.context ?? {};
          this.showActionForm(actionId, result.nextStep.fields, this.nextStepContext);
          return;
        }

        // Verification chaining: show pending action after successful verification
        if (actionId === 'verify-reservation' && this.pendingActionId) {
          const pending = this.pendingActionId;
          this.pendingActionId = null;
          setTimeout(() => this.showActionForm(pending), 300);
        }
      } else {
        this.callbacks.onSystemMessage(result.message || this.strings.actionFailed);

        // For retryable verification errors, re-show the form
        if (result.error !== 'attempts_exceeded' && result.error !== 'invalid_session') {
          this.showActionForm(actionId, undefined, context);
          return;
        }
      }
    } catch {
      this.callbacks.onHideForm();
      this.callbacks.onSystemMessage(this.strings.submitFailed);
    }

    this.nextStepContext = null;
  }
}
