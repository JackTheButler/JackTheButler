/**
 * Message Bubble Component
 *
 * 4 variants: guest (right), ai (left), staff (left, warm), system (center).
 * Content set via textContent (XSS safe).
 */

import { createElement } from '../utils.js';
import type { MessageVariant } from '../types.js';

export interface MessageBubble {
  element: HTMLDivElement;
}

export function createMessageBubble(
  content: string,
  variant: MessageVariant,
  label?: string
): MessageBubble {
  const bubble = createElement('div', {
    class: `butler-msg butler-msg--${variant} butler-fade-in`,
  });

  if (label && variant !== 'system') {
    const labelEl = createElement('div', { class: 'butler-msg-label' }, [label]);
    bubble.appendChild(labelEl);
  }

  const text = createElement('div', { class: 'butler-msg-text' });
  text.textContent = content;
  bubble.appendChild(text);

  return { element: bubble };
}
