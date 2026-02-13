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
