/**
 * Input Bar Component
 *
 * Pill-shaped input + SVG arrow send button.
 * Enter to send, auto-focus on panel open.
 */

import { createElement } from '../utils.js';
import { DEFAULT_STRINGS } from '../defaults.js';
import type { WidgetStrings } from '../defaults.js';

export interface InputBar {
  element: HTMLDivElement;
  setEnabled(enabled: boolean): void;
  focus(): void;
  updateStrings(strings: WidgetStrings): void;
}

export function createInputBar(onSend: (content: string) => void, strings: WidgetStrings = DEFAULT_STRINGS): InputBar {
  const bar = createElement('div', { class: 'butler-input-bar' });

  const input = createElement('input', {
    class: 'butler-input',
    type: 'text',
    placeholder: strings.inputPlaceholder,
    autocomplete: 'off',
  }) as HTMLInputElement;
  input.disabled = true;

  const sendBtn = createElement('button', {
    class: 'butler-send-btn',
    type: 'button',
    'aria-label': strings.sendButton,
  });
  sendBtn.disabled = true;
  sendBtn.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M15.75 2.25L8.25 9.75M15.75 2.25L10.5 15.75L8.25 9.75M15.75 2.25L2.25 7.5L8.25 9.75" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  function doSend(): void {
    const content = input.value.trim();
    if (!content) return;
    onSend(content);
    input.value = '';
    input.focus();
  }

  sendBtn.addEventListener('click', doSend);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSend();
  });

  bar.appendChild(input);
  bar.appendChild(sendBtn);

  return {
    element: bar,
    setEnabled(enabled) {
      input.disabled = !enabled;
      sendBtn.disabled = !enabled;
    },
    focus() {
      input.focus();
    },
    updateStrings(s: WidgetStrings) {
      input.placeholder = s.inputPlaceholder;
      sendBtn.setAttribute('aria-label', s.sendButton);
    },
  };
}
