/**
 * Chat Header Component
 *
 * Hotel name/logo + close button with SVG X icon.
 */

import { createElement } from '../utils.js';

export interface ChatHeader {
  element: HTMLDivElement;
  setTitle(title: string): void;
  setLogo(url: string): void;
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
    const icon = createElement('span', { class: 'butler-header-icon' });
    icon.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88837 21.6244 10.4003 22 12 22Z"/>' +
      '<circle cx="16" cy="12" r="1" fill="var(--butler-bg-header)"/>' +
      '<circle cx="12" cy="12" r="1" fill="var(--butler-bg-header)"/>' +
      '<circle cx="8" cy="12" r="1" fill="var(--butler-bg-header)"/>' +
      '</svg>';
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

  return {
    element: header,
    setTitle(title: string) {
      titleEl.textContent = title;
    },
    setLogo(url: string) {
      // Replace the icon/logo element (first child)
      const firstChild = header.firstElementChild;
      if (firstChild && (firstChild.tagName === 'SPAN' || firstChild.tagName === 'IMG')) {
        const logo = createElement('img', {
          class: 'butler-header-logo',
          src: url,
          alt: titleEl.textContent || 'Logo',
        });
        header.replaceChild(logo, firstChild);
      }
    },
  };
}
