/**
 * Typing Indicator Component
 *
 * Three dots with staggered bounce animation.
 */

import { createElement } from '../utils.js';

export interface TypingIndicator {
  element: HTMLDivElement;
  show(): void;
  hide(): void;
}

export function createTypingIndicator(): TypingIndicator {
  const container = createElement('div', { class: 'butler-typing' });
  container.style.display = 'none';

  const dots = createElement('div', { class: 'butler-typing-dots' });
  dots.appendChild(createElement('span', { class: 'butler-typing-dot' }));
  dots.appendChild(createElement('span', { class: 'butler-typing-dot' }));
  dots.appendChild(createElement('span', { class: 'butler-typing-dot' }));
  container.appendChild(dots);

  return {
    element: container,
    show() {
      container.style.display = 'flex';
    },
    hide() {
      container.style.display = 'none';
    },
  };
}
