/**
 * WebChat Widget Entry Point
 *
 * IIFE: capture script element, derive gateway origin,
 * create widget, detect CTA elements, expose window.ButlerChat.
 */

import { ButlerChatWidget } from './widget.js';
import { deriveGatewayOrigin, readButlerKey, contrastText } from './utils.js';
import type { ButtonIcon } from './types.js';

/** SVG path data for each button icon option (24x24 viewBox, stroke-based) */
const ICON_SVGS: Record<ButtonIcon, string> = {
  chat: `<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/>`,
  bell: `<path d='M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9'/><path d='M13.73 21a2 2 0 0 1-3.46 0'/>`,
  dots: `<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/><circle cx='8' cy='10' r='1' fill='currentColor' stroke='none'/><circle cx='12' cy='10' r='1' fill='currentColor' stroke='none'/><circle cx='16' cy='10' r='1' fill='currentColor' stroke='none'/>`,
  headset: `<path d='M3 18v-6a9 9 0 0 1 18 0v6'/><path d='M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z'/>`,
};

// Capture the current script element before any async work
const scriptEl = document.currentScript as HTMLScriptElement | null;

// Derive gateway origin from the script's src attribute
const gatewayOrigin = deriveGatewayOrigin(scriptEl);
const butlerKey = readButlerKey(scriptEl);

// Create and init widget
const widget = new ButlerChatWidget({ gatewayOrigin, butlerKey });

(async () => {
  await widget.init();

  // CTA detection: find all [data-butler-chat] elements
  const ctas = document.querySelectorAll<HTMLElement>('[data-butler-chat]');

  for (const cta of ctas) {
    // Attach click handler
    cta.addEventListener('click', (e) => {
      e.preventDefault();
      widget.toggle();
    });

    // Attribute-based preset
    const preset = cta.getAttribute('data-butler-chat');
    if (!preset || preset === '' || preset === 'bubble') {
      cta.classList.add('butler-chat-trigger');
      // Move bubble to body so parent CSS (filters, transforms) can't trap position:fixed
      document.body.appendChild(cta);
    } else if (preset === 'inline') {
      cta.classList.add('butler-chat-inline');
    }

    // Reveal CTA if hidden before widget loaded
    cta.style.removeProperty('display');
  }

  // Inject default CTA styles into document head
  const ctaColor = widget.primaryColor || '#0084ff';
  const iconPaths = ICON_SVGS[widget.buttonIcon] || ICON_SVGS.chat;
  const ctaIconSvg = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${contrastText(ctaColor)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${iconPaths}</svg>`);
  if (ctas.length > 0) {
    const ctaStyle = document.createElement('style');
    ctaStyle.id = 'butler-chat-cta-styles';
    ctaStyle.textContent = `
      .butler-chat-trigger {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: ${ctaColor};
        color: #fff;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 2147483646;
        transition: transform 300ms ease, box-shadow 150ms ease, opacity 300ms ease;
        padding: 0;
        font-size: 0;
        line-height: 0;
      }
      .butler-chat-trigger.butler-hidden {
        opacity: 0;
        transform: translateY(80px);
        pointer-events: none;
      }
      .butler-chat-trigger:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
      }
      .butler-chat-trigger::after {
        content: '';
        display: block;
        width: 24px;
        height: 24px;
        background-image: url("data:image/svg+xml,${ctaIconSvg}");
        background-size: contain;
        background-repeat: no-repeat;
      }
      .butler-chat-inline {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 24px;
        background: ${ctaColor};
        color: ${contrastText(ctaColor)};
        border: none;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        font-family: inherit;
        line-height: 1;
        transition: background 150ms ease, transform 150ms ease;
      }
      .butler-chat-inline:hover {
        filter: brightness(0.9);
        transform: scale(1.03);
      }
      .butler-chat-inline::before {
        content: '';
        display: block;
        width: 18px;
        height: 18px;
        background-image: url("data:image/svg+xml,${ctaIconSvg}");
        background-size: contain;
        background-repeat: no-repeat;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(ctaStyle);

    // Hide bubble on scroll down, show on scroll up
    const bubbles = document.querySelectorAll('.butler-chat-trigger');
    if (bubbles.length > 0) {
      let lastY = window.scrollY;
      window.addEventListener('scroll', () => {
        const y = window.scrollY;
        const hidden = y > lastY && y > 100;
        bubbles.forEach((b) => b.classList.toggle('butler-hidden', hidden));
        lastY = y;
      }, { passive: true });
    }
  }

  // Expose globally
  (window as unknown as Record<string, unknown>).ButlerChat = widget;
})();
