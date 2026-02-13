/**
 * Responsive Styles
 */

export const responsiveStyles = `
@media (max-width: 639px) {
  .butler-panel {
    width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    bottom: 0;
    right: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .butler-input-bar {
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }
}
`;
