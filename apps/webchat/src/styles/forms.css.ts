/**
 * Action Form Styles
 */

export const formStyles = `
.butler-action-form {
  align-self: stretch;
  background: #f0f4ff;
  border: 1px solid #c4d4ff;
  border-radius: var(--butler-radius-form);
  padding: 16px;
  margin: 4px 0;
}

.butler-form-title {
  font-size: var(--butler-font-size-base);
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--butler-text-primary);
}

.butler-form-field {
  margin-bottom: 10px;
}

.butler-form-field--hidden {
  display: none;
}

.butler-form-label {
  display: block;
  font-size: var(--butler-font-size-small);
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--butler-text-secondary);
}

.butler-form-input,
.butler-form-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--butler-border-color);
  border-radius: 8px;
  font-family: var(--butler-font-family);
  font-size: var(--butler-font-size-base);
  color: var(--butler-text-primary);
  background: var(--butler-bg-panel);
  transition: border-color 150ms ease;
}

.butler-form-input:focus,
.butler-form-select:focus {
  border-color: var(--butler-color-primary);
}

.butler-form-input--readonly {
  background: #f0f0f0;
}

.butler-form-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4L6 8L10 4' stroke='%23666' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}

.butler-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.butler-form-submit {
  padding: 8px 16px;
  background: var(--butler-color-primary);
  color: var(--butler-text-on-primary);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  transition: background 150ms ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.butler-form-submit:hover:not(:disabled) {
  background: var(--butler-color-primary-hover);
}

.butler-form-submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.butler-form-cancel {
  padding: 8px 16px;
  background: #e0e0e0;
  color: var(--butler-text-primary);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  transition: background 150ms ease;
}

.butler-form-cancel:hover {
  background: #d0d0d0;
}

.butler-form-field--error .butler-form-input,
.butler-form-field--error .butler-form-select {
  border-color: #e74c3c;
}

.butler-form-error {
  color: #e74c3c;
  font-size: var(--butler-font-size-small);
  margin-top: 4px;
}

.butler-form-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: var(--butler-text-on-primary);
  border-radius: 50%;
  animation: butler-spin 0.6s linear infinite;
}

@keyframes butler-spin {
  to { transform: rotate(360deg); }
}
`;
