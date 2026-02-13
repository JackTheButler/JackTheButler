/**
 * Panel Styles
 */

export const panelStyles = `
.butler-panel {
  display: flex;
  flex-direction: column;
  width: var(--butler-panel-width);
  height: var(--butler-panel-height);
  max-height: calc(100vh - 32px);
  background: var(--butler-bg-panel);
  border-radius: var(--butler-radius-panel);
  box-shadow: var(--butler-shadow-panel);
  overflow: hidden;
  font-family: var(--butler-font-family);
  font-size: var(--butler-font-size-base);
  color: var(--butler-text-primary);
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: var(--butler-z-index);
  transform: translateY(100%);
  opacity: 0;
  transition:
    transform var(--butler-transition-speed) var(--butler-transition-easing),
    opacity var(--butler-transition-speed) var(--butler-transition-easing);
  pointer-events: none;
}

.butler-panel.butler-panel--open {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}
`;
