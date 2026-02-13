/**
 * Message Bubble Component
 *
 * 4 variants: guest (right), ai (left), staff (left, warm), system (center).
 * Content set via textContent (XSS safe).
 * Optional quick reply buttons rendered below the text.
 */

import { createElement } from '../utils.js';
import type { MessageVariant } from '../types.js';

export interface MessageBubbleOptions {
  quickReplies?: string[];
  onQuickReply?: (text: string) => void;
}

export interface MessageBubble {
  element: HTMLDivElement;
}

export function createMessageBubble(
  content: string,
  variant: MessageVariant,
  label?: string,
  options?: MessageBubbleOptions
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

  // Quick reply buttons
  if (options?.quickReplies?.length && options.onQuickReply) {
    const container = createElement('div', { class: 'butler-quick-replies' });
    for (const reply of options.quickReplies) {
      const btn = createElement('button', {
        class: 'butler-quick-reply',
        type: 'button',
      });
      btn.textContent = reply;
      btn.addEventListener('click', () => {
        // Disable all buttons, highlight selected
        for (const b of container.querySelectorAll<HTMLButtonElement>('.butler-quick-reply')) {
          b.disabled = true;
          if (b !== btn) b.classList.add('butler-quick-reply--faded');
        }
        btn.classList.add('butler-quick-reply--selected');
        options.onQuickReply!(reply);
      });
      container.appendChild(btn);
    }
    bubble.appendChild(container);
  }

  return { element: bubble };
}
