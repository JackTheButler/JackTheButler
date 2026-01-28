/**
 * Integration Layer
 *
 * Unified integration layer for all external service connections:
 * - AI Providers (Anthropic, OpenAI, Ollama)
 * - Communication Channels (WhatsApp, SMS, Email)
 * - Property Management Systems (PMS)
 *
 * @see docs/03-architecture/c4-components/integration-layer.md
 */

// Core types, registry, and status
export * from './core/index.js';

// AI Provider integrations
export * from './ai/index.js';

// Channel integrations
export * from './channels/index.js';

// PMS integrations (legacy structure, to be migrated)
export * from './types.js';
export * from './pms/index.js';
