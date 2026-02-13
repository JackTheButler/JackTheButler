/**
 * Chat Header Component
 *
 * Hotel name/logo + close button with SVG X icon.
 */

import { createElement } from '../utils.js';

export interface ChatHeader {
  element: HTMLDivElement;
}

export function createChatHeader(
  onClose: () => void,
  title = 'Hotel Concierge',
  logoUrl?: string
): ChatHeader {
  const header = createElement('div', { class: 'butler-header' });

  if (logoUrl) {
    const logo = createElement('img', {
      class: 'butler-header-logo',
      src: logoUrl,
      alt: title,
    });
    header.appendChild(logo);
  } else {
    const icon = createElement('span', { class: 'butler-header-icon' }, ['\u{1F3E8}']);
    header.appendChild(icon);
  }

  const titleEl = createElement('span', { class: 'butler-header-title' }, [title]);
  header.appendChild(titleEl);

  const closeBtn = createElement('button', {
    class: 'butler-header-close',
    'aria-label': 'Close chat',
    type: 'button',
  });
  closeBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>';
  closeBtn.addEventListener('click', onClose);
  header.appendChild(closeBtn);

  return { element: header };
}
