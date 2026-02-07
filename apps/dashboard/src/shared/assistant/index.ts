/**
 * Shared Assistant System
 *
 * Reusable assistant infrastructure for guided workflows.
 *
 * @module shared/assistant
 */

// Types
export * from './types';

// Registry
export { assistantRegistry } from './registry';

// Context
export { AssistantProvider, useAssistantContext, useAssistant } from './context';
export type { AssistantProviderProps } from './context';

// Hooks
export * from './hooks';

// Components
export * from './components';
