/**
 * WebChat Widget Utilities
 */

/**
 * Derive the gateway origin from the script's src attribute.
 * Falls back to the current page's origin (for dev/proxy setups).
 */
export function deriveGatewayOrigin(scriptEl: HTMLScriptElement | null): string {
  if (scriptEl?.src) {
    try {
      const url = new URL(scriptEl.src);
      return url.origin;
    } catch {
      // Invalid URL, fall through
    }
  }
  return location.origin;
}

/**
 * Read the data-butler-key attribute from the script element.
 */
export function readButlerKey(scriptEl: HTMLScriptElement | null): string | undefined {
  return scriptEl?.getAttribute('data-butler-key') ?? undefined;
}

/**
 * Darken a hex color by a given amount (0-255).
 */
export function darkenHex(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const r = Math.max(0, parseInt(h.substring(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(h.substring(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(h.substring(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Convert a hex color to rgba string.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Return '#ffffff' or '#1a1a2e' depending on the luminance of a hex color.
 */
export function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  // Relative luminance (ITU-R BT.709)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1a1a2e' : '#ffffff';
}

/**
 * Create a DOM element with optional attributes and children.
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value);
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }
  return el;
}
