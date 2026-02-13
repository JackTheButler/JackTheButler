/**
 * WebChat Widget Entry Point
 *
 * IIFE: capture script element, derive gateway origin,
 * create widget, detect CTA elements, expose window.ButlerChat.
 */

import { ButlerChatWidget } from './widget.js';
import { deriveGatewayOrigin, readButlerKey } from './utils.js';

// Capture the current script element before any async work
const scriptEl = document.currentScript as HTMLScriptElement | null;

// Derive gateway origin from the script's src attribute
const gatewayOrigin = deriveGatewayOrigin(scriptEl);
const butlerKey = readButlerKey(scriptEl);

// Create and init widget
const widget = new ButlerChatWidget({ gatewayOrigin, butlerKey });
widget.init();

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
  }
  // "custom" → no default styles
}

// Inject default CTA styles into document head
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
      background: #0084ff;
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 2147483646;
      transition: transform 150ms ease, box-shadow 150ms ease;
      padding: 0;
      font-size: 0;
      line-height: 0;
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
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/%3E%3C/svg%3E");
      background-size: contain;
      background-repeat: no-repeat;
    }
  `;
  document.head.appendChild(ctaStyle);
}

// Expose globally
(window as unknown as Record<string, unknown>).ButlerChat = widget;
