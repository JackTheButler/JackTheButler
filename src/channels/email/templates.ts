/**
 * Email Templates
 *
 * Loads and renders email templates.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('email:templates');

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Template cache
 */
const templateCache = new Map<string, string>();

/**
 * Available template names
 */
export type TemplateName = 'reply';

/**
 * Template variables
 */
export interface ReplyTemplateVars {
  content: string;
}

export type TemplateVars = ReplyTemplateVars;

/**
 * Load a template file
 */
function loadTemplate(name: TemplateName): string {
  if (templateCache.has(name)) {
    return templateCache.get(name)!;
  }

  const templatePath = join(__dirname, 'templates', `${name}.html`);

  try {
    const content = readFileSync(templatePath, 'utf-8');
    templateCache.set(name, content);
    log.debug({ name }, 'Loaded email template');
    return content;
  } catch (error) {
    log.error({ err: error, name, path: templatePath }, 'Failed to load email template');
    throw new Error(`Email template not found: ${name}`);
  }
}

/**
 * Render a template with variables
 */
export function renderTemplate(name: TemplateName, vars: TemplateVars): string {
  const template = loadTemplate(name);

  // Simple variable replacement using {{varName}} syntax
  let rendered = template;

  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{{${key}}}`;
    // Escape HTML in values for security
    const escapedValue = escapeHtml(String(value));
    rendered = rendered.replace(new RegExp(placeholder, 'g'), escapedValue);
  }

  return rendered;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

/**
 * Clear template cache (for testing)
 */
export function clearTemplateCache(): void {
  templateCache.clear();
}
