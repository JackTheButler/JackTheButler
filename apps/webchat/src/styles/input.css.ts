/**
 * Input Bar Styles
 */

export const inputStyles = `
.butler-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--butler-bg-panel);
  border-top: 1px solid var(--butler-border-color);
  flex-shrink: 0;
}

.butler-input {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid var(--butler-border-color);
  border-radius: var(--butler-radius-input);
  font-family: var(--butler-font-family);
  font-size: var(--butler-font-size-base);
  color: var(--butler-text-primary);
  background: var(--butler-bg-panel);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.butler-input::placeholder {
  color: var(--butler-text-light);
}

.butler-input:focus {
  border-color: var(--butler-color-primary);
  box-shadow: var(--butler-shadow-input-focus);
}

.butler-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.butler-send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--butler-color-primary);
  color: var(--butler-text-on-primary);
  flex-shrink: 0;
  transition: background 150ms ease, opacity 150ms ease;
}

.butler-send-btn:hover:not(:disabled) {
  background: var(--butler-color-primary-hover);
}

.butler-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
`;
