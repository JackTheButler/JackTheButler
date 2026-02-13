/**
 * Theme — CSS Custom Properties
 *
 * Full theming system. Phase 6 overrides these via config endpoint.
 */

export const themeStyles = `
:host {
  --butler-color-primary: #0084ff;
  --butler-color-primary-hover: #0073e6;
  --butler-color-primary-light: rgba(0, 132, 255, 0.1);

  --butler-bg-panel: #ffffff;
  --butler-bg-header: #1a1a2e;
  --butler-bg-messages: #f7f8fa;

  --butler-bg-bubble-guest: var(--butler-color-primary);
  --butler-bg-bubble-ai: #ffffff;
  --butler-bg-bubble-staff: #fff3cd;
  --butler-border-bubble-ai: #e0e0e0;
  --butler-border-bubble-staff: #ffc107;

  --butler-text-primary: #1a1a2e;
  --butler-text-secondary: #666666;
  --butler-text-light: #999999;
  --butler-text-on-primary: #ffffff;
  --butler-text-on-header: #ffffff;

  --butler-border-color: #e0e0e0;

  --butler-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --butler-font-size-base: 14px;
  --butler-font-size-small: 12px;
  --butler-font-size-label: 10px;

  --butler-radius-panel: 16px;
  --butler-radius-bubble: 12px;
  --butler-radius-input: 20px;
  --butler-radius-form: 12px;

  --butler-shadow-panel: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
  --butler-shadow-input-focus: 0 0 0 3px var(--butler-color-primary-light);

  --butler-transition-speed: 300ms;
  --butler-transition-easing: cubic-bezier(0.16, 1, 0.3, 1);

  --butler-panel-width: 380px;
  --butler-panel-height: 600px;
  --butler-z-index: 2147483647;
}
`;
