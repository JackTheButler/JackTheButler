/**
 * Message List Component
 *
 * Scrollable message area with smooth auto-scroll and
 * scroll-to-bottom floating button via IntersectionObserver.
 */

import { createElement } from '../utils.js';
import { createMessageBubble } from './message-bubble.js';
import type { MessageVariant } from '../types.js';

export interface MessageList {
  element: HTMLDivElement;
  addMessage(content: string, variant: MessageVariant, label?: string): void;
  scrollToBottom(): void;
}

export function createMessageList(): MessageList {
  const container = createElement('div', { class: 'butler-messages' });

  // Sentinel element at the bottom — used by IntersectionObserver
  const sentinel = createElement('div', { class: 'butler-messages-sentinel' });
  container.appendChild(sentinel);

  // Scroll-to-bottom button
  const scrollBtn = createElement('button', {
    class: 'butler-scroll-btn',
    'aria-label': 'Scroll to bottom',
    type: 'button',
  });
  scrollBtn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M8 3V13M8 13L3 8M8 13L13 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  scrollBtn.addEventListener('click', () => scrollToBottom());
  container.appendChild(scrollBtn);

  // Track whether user is near bottom
  let isNearBottom = true;
  let showBtnTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        isNearBottom = entry.isIntersecting;
        if (isNearBottom) {
          // Hide immediately (with CSS transition)
          if (showBtnTimer) { clearTimeout(showBtnTimer); showBtnTimer = null; }
          scrollBtn.classList.remove('butler-scroll-btn--visible');
        } else if (!showBtnTimer) {
          // Show after delay (avoids flash during auto-scroll)
          showBtnTimer = setTimeout(() => {
            showBtnTimer = null;
            if (!isNearBottom) scrollBtn.classList.add('butler-scroll-btn--visible');
          }, 600);
        }
      }
    },
    { root: container, threshold: 0 }
  );
  observer.observe(sentinel);

  function scrollToBottom(): void {
    sentinel.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  return {
    element: container,
    addMessage(content, variant, label) {
      const bubble = createMessageBubble(content, variant, label);
      container.insertBefore(bubble.element, sentinel);
      if (isNearBottom) {
        scrollToBottom();
      }
    },
    scrollToBottom,
  };
}
