/**
 * Message Styles
 */

export const messageStyles = `
.butler-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--butler-bg-messages);
  position: relative;
  scroll-behavior: smooth;
}

.butler-messages-sentinel {
  height: 0;
  flex-shrink: 0;
}

.butler-scroll-btn {
  position: sticky;
  bottom: 4px;
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  min-height: 0;
  height: 0;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--butler-bg-panel);
  color: var(--butler-text-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1;
  opacity: 0;
  transform: translateY(20px) scale(0.8);
  pointer-events: none;
  transition: opacity 250ms ease-out, transform 250ms ease-out, background 150ms ease;
}

.butler-scroll-btn.butler-scroll-btn--visible {
  opacity: 1;
  min-height: 32px;
  height: 32px;
  overflow: visible;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.butler-scroll-btn:hover {
  background: var(--butler-border-color);
}

.butler-msg {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: var(--butler-radius-bubble);
  font-size: var(--butler-font-size-base);
  line-height: 1.45;
  word-wrap: break-word;
}

.butler-msg-label {
  font-size: var(--butler-font-size-label);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 3px;
  opacity: 0.7;
  font-weight: 500;
}

.butler-msg--guest {
  align-self: flex-end;
  background: var(--butler-bg-bubble-guest);
  color: var(--butler-text-on-primary);
  border-bottom-right-radius: 4px;
}

.butler-msg--ai {
  align-self: flex-start;
  background: var(--butler-bg-bubble-ai);
  color: var(--butler-text-primary);
  border: 1px solid var(--butler-border-bubble-ai);
  border-bottom-left-radius: 4px;
}

.butler-msg--staff {
  align-self: flex-start;
  background: var(--butler-bg-bubble-staff);
  color: var(--butler-text-primary);
  border: 1px solid var(--butler-border-bubble-staff);
  border-bottom-left-radius: 4px;
}

.butler-msg--system {
  align-self: center;
  background: transparent;
  color: var(--butler-text-light);
  font-size: var(--butler-font-size-small);
  font-style: italic;
  padding: 4px 8px;
  max-width: 90%;
  text-align: center;
}

.butler-quick-replies {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.butler-quick-reply {
  padding: 5px 12px;
  border-radius: 14px;
  border: 1px solid var(--butler-color-primary);
  background: transparent;
  color: var(--butler-color-primary);
  font-size: var(--butler-font-size-small);
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, opacity 150ms ease;
}

.butler-quick-reply:hover:not(:disabled) {
  background: var(--butler-color-primary);
  color: var(--butler-text-on-primary);
}

.butler-quick-reply--selected {
  background: var(--butler-color-primary);
  color: var(--butler-text-on-primary);
}

.butler-quick-reply--faded {
  opacity: 0.4;
}

.butler-quick-reply:disabled {
  cursor: default;
}
`;
