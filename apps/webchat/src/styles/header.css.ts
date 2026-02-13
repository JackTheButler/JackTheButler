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
`;
