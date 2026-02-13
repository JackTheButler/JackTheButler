/**
 * Chat Panel Component
 *
 * Main container: header + messages + input bar.
 */

import { createElement } from '../utils.js';

export interface ChatPanel {
  element: HTMLDivElement;
  setContent(header: HTMLElement, messages: HTMLElement, input: HTMLElement): void;
}

export function createChatPanel(): ChatPanel {
  const panel = createElement('div', { class: 'butler-panel' });

  return {
    element: panel,
    setContent(header, messages, input) {
      panel.appendChild(header);
      panel.appendChild(messages);
      panel.appendChild(input);
    },
  };
}
