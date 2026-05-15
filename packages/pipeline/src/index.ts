// Public surface of @jackthebutler/pipeline.
//
// types/   — data shapes
// services/ — provider contracts (what the consumer implements)
// core/    — pipeline runtime

// ─── Pipeline core ──────────────────────────────────────────────
export type { MessageContext } from './core/context.js';
export type { Env, Services, Stage, Pipeline, PipelineConfig } from './core/pipeline.js';
export { createPipeline, PipelineError } from './core/pipeline.js';

// ─── Data types ─────────────────────────────────────────────────
export type { InboundMessage, OutboundMessage } from './types/messages.js';
export type { Conversation, Message } from './types/conversation.js';
export type { Entity } from './types/entity.js';
export type { Intent } from './types/intent.js';
export type {
  AIModelTier,
  AICompletionMessage,
  AICompletionRequest,
  AICompletionResult,
  AIEmbeddingRequest,
  AIEmbeddingResult,
} from './types/ai.js';
export type { LogFields } from './types/logger.js';
export type { KnowledgeHit, KnowledgeSearchOptions } from './types/knowledge.js';
export type { MemoryHit, NewMemory, MemoryRecallOptions } from './types/memory.js';
export type { ClassificationResult } from './types/classification.js';
export type { AIResponse } from './types/response.js';

// ─── Provider contracts ─────────────────────────────────────────
export type { EntityProvider } from './services/entity.js';
export type { IntentProvider } from './services/intent.js';
export type { PromptProvider } from './services/prompt.js';
export type { AIProvider } from './services/ai.js';
export type { ConversationProvider } from './services/conversation.js';
export type { Logger } from './services/logger.js';
export type { KnowledgeProvider } from './services/knowledge.js';
export type { MemoryProvider } from './services/memory.js';

// ─── Reference stages ───────────────────────────────────────────
export {
  resolveConversation,
  detectLanguage,
  translateInbound,
  loadHistory,
  saveInboundMessage,
  classifyIntent,
  computeEmbedding,
  loadKnowledge,
  loadMemories,
  generateResponse,
  translateOutbound,
  saveOutboundMessage,
  defaultStages,
} from './stages/index.js';
