/**
 * Header Styles
 */

export const headerStyles = `
.butler-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: var(--butler-bg-header);
  color: var(--butler-text-on-header);
  flex-shrink: 0;
}

.butler-header-icon {
  font-size: 20px;
  line-height: 1;
}

.butler-header-logo {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.butler-header-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.butler-header-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--butler-text-on-header);
  transition: background 150ms ease;
}

.butler-header-close:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Language picker */
.butler-lang-picker {
  position: relative;
}

.butler-lang-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--butler-text-on-header);
  opacity: 0.8;
  transition: background 150ms ease, opacity 150ms ease;
}

.butler-lang-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  opacity: 1;
}

.butler-lang-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 120px;
  background: var(--butler-bg-panel, #fff);
  border: 1px solid var(--butler-border-color, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 10;
  overflow: hidden;
  flex-direction: column;
}

.butler-lang-dropdown--open {
  display: flex;
}

.butler-lang-option {
  display: block;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  font-size: 13px;
  color: var(--butler-text-primary, #333);
  background: none;
  border: none;
  cursor: pointer;
  transition: background 100ms ease;
}

.butler-lang-option:hover {
  background: var(--butler-color-primary-light, rgba(0, 0, 0, 0.05));
}

.butler-lang-option--active {
  font-weight: 600;
  color: var(--butler-color-primary, #2563eb);
}

:host([dir="rtl"]) .butler-lang-dropdown {
  right: auto;
  left: 0;
}

:host([dir="rtl"]) .butler-lang-option {
  text-align: right;
}
`;
