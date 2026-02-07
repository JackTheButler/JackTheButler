/**
 * Setup Feature
 *
 * Setup wizard for configuring Jack on first run.
 *
 * @module features/setup
 */

// Types
export * from './types';

// API
export * from './api';

// Utilities
export * from './utils';

// Configs
export * from './configs';

// Form Schemas
export * from './schemas';

// Steps
export * from './steps';

// Assistant Configuration
export { setupAssistantConfig, registerSetupAssistant, getInitialSetupContext } from './assistant-config';

// Main Component
export { SetupAssistant } from './SetupAssistant';
