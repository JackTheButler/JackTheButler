/**
 * Assistant Registry
 *
 * Global registry for all assistant configurations.
 *
 * @module shared/assistant/registry
 */

import type { AssistantConfig } from './types';

/**
 * Registry for managing assistant configurations
 */
class AssistantRegistry {
  private assistants = new Map<string, AssistantConfig>();

  /**
   * Register an assistant configuration
   */
  register<T>(config: AssistantConfig<T>): void {
    this.assistants.set(config.id, config as AssistantConfig);
  }

  /**
   * Unregister an assistant
   */
  unregister(id: string): void {
    this.assistants.delete(id);
  }

  /**
   * Get assistant by ID
   */
  get(id: string): AssistantConfig | undefined {
    return this.assistants.get(id);
  }

  /**
   * Get all registered assistants
   */
  getAll(): AssistantConfig[] {
    return Array.from(this.assistants.values());
  }

  /**
   * Check if an assistant is registered
   */
  has(id: string): boolean {
    return this.assistants.has(id);
  }

  /**
   * Get assistants that should appear on a page
   */
  getForPage(pagePath: string): AssistantConfig[] {
    return this.getAll().filter((a) =>
      a.triggers?.pages?.some((p) => p === '*' || pagePath.startsWith(p))
    );
  }

  /**
   * Get assistant for an error code
   */
  getForError(errorCode: string): AssistantConfig | undefined {
    return this.getAll().find((a) => a.triggers?.errorCodes?.includes(errorCode));
  }

  /**
   * Search assistants by keyword
   */
  searchByKeyword(query: string): AssistantConfig[] {
    const q = query.toLowerCase();
    return this.getAll().filter((a) =>
      a.triggers?.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  }

  /**
   * Get assistants that should auto-activate
   */
  getAutoActivate(pagePath: string): AssistantConfig | undefined {
    const pageAssistants = this.getForPage(pagePath);
    return pageAssistants.find(
      (a) => a.triggers?.autoActivate && (a.triggers?.condition?.() ?? true)
    );
  }
}

/**
 * Global assistant registry singleton
 */
export const assistantRegistry = new AssistantRegistry();
