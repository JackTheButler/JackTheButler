/**
 * Chat Header Component
 *
 * Hotel name/logo + close button + language picker with SVG globe icon.
 */

import { createElement } from '../utils.js';
import { DEFAULT_STRINGS } from '../defaults.js';
import type { WidgetStrings } from '../defaults.js';

/** Display labels for the language picker */
const LANGUAGE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Espa\u00f1ol' },
  { code: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' },
  { code: 'hi', label: '\u0939\u093f\u0928\u094d\u0926\u0940' },
  { code: 'ru', label: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439' },
  { code: 'zh', label: '\u4e2d\u6587' },
];

const GLOBE_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="12" cy="12" r="10"/>' +
  '<path d="M2 12h20"/>' +
  '<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>' +
  '</svg>';

export interface ChatHeader {
  element: HTMLDivElement;
  setTitle(title: string): void;
  setLogo(url: string): void;
  updateStrings(strings: WidgetStrings): void;
  setActiveLocale(locale: string): void;
}

function createDefaultIcon(): HTMLSpanElement {
  const icon = createElement('span', { class: 'butler-header-icon' });
  icon.innerHTML =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
    '</svg>';
  return icon;
}

function createLogoImg(src: string, alt: string): HTMLImageElement {
  const logo = createElement('img', {
    class: 'butler-header-logo',
    src,
    alt,
  });
  logo.addEventListener('error', () => {
    logo.replaceWith(createDefaultIcon());
  });
  return logo;
}

export function createChatHeader(
  onClose: () => void,
  title = 'Hotel Concierge',
  logoUrl?: string,
  strings: WidgetStrings = DEFAULT_STRINGS,
  onLocaleChange?: (locale: string) => void,
  activeLocale = 'en'
): ChatHeader {
  const header = createElement('div', { class: 'butler-header' });

  header.appendChild(logoUrl ? createLogoImg(logoUrl, title) : createDefaultIcon());

  const titleEl = createElement('span', { class: 'butler-header-title' }, [title]);
  header.appendChild(titleEl);

  // Language picker (globe button + dropdown)
  const langWrapper = createElement('div', { class: 'butler-lang-picker' });

  const langBtn = createElement('button', {
    class: 'butler-lang-btn',
    'aria-label': 'Language',
    type: 'button',
  });
  langBtn.innerHTML = GLOBE_SVG;
  langWrapper.appendChild(langBtn);

  const dropdown = createElement('div', { class: 'butler-lang-dropdown' });
  for (const opt of LANGUAGE_OPTIONS) {
    const item = createElement('button', {
      class: 'butler-lang-option' + (opt.code === activeLocale ? ' butler-lang-option--active' : ''),
      type: 'button',
      'data-locale': opt.code,
    }, [opt.label]);
    item.addEventListener('click', () => {
      dropdown.classList.remove('butler-lang-dropdown--open');
      if (opt.code !== currentLocale) {
        currentLocale = opt.code;
        updateActiveOption();
        onLocaleChange?.(opt.code);
      }
    });
    dropdown.appendChild(item);
  }
  langWrapper.appendChild(dropdown);

  let currentLocale = activeLocale;

  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('butler-lang-dropdown--open');
  });

  // Close dropdown on outside click (within shadow DOM)
  header.addEventListener('click', () => {
    dropdown.classList.remove('butler-lang-dropdown--open');
  });

  function updateActiveOption(): void {
    for (const item of dropdown.querySelectorAll('.butler-lang-option')) {
      item.classList.toggle(
        'butler-lang-option--active',
        (item as HTMLElement).dataset.locale === currentLocale
      );
    }
  }

  header.appendChild(langWrapper);

  // Close button
  const closeBtn = createElement('button', {
    class: 'butler-header-close',
    'aria-label': strings.closeChat,
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
      const firstChild = header.firstElementChild;
      if (firstChild && (firstChild.tagName === 'SPAN' || firstChild.tagName === 'IMG')) {
        header.replaceChild(createLogoImg(url, titleEl.textContent || 'Logo'), firstChild);
      }
    },
    updateStrings(s: WidgetStrings) {
      closeBtn.setAttribute('aria-label', s.closeChat);
    },
    setActiveLocale(locale: string) {
      currentLocale = locale;
      updateActiveOption();
    },
  };
}
