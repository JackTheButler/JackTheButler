/**
 * Reference stages — drop-in implementations consumers can use as-is or
 * replace with their own. Each stage is a `Stage` function exported by
 * name.
 *
 * `defaultStages` is the ordered list `createPipeline` uses when no
 * `stages` array is passed in the config. Consumers can override by
 * passing their own array — typically a subset or `[...defaultStages, mine]`.
 *
 * @module stages
 */

import type { Stage } from '../core/pipeline.js';
import { resolveConversation } from './resolve-conversation.js';
import { detectLanguage } from './detect-language.js';
import { translateInbound } from './translate-inbound.js';
import { loadHistory } from './load-history.js';
import { saveInboundMessage } from './save-inbound-message.js';
import { classifyIntent } from './classify-intent.js';
import { computeEmbedding } from './compute-embedding.js';
import { loadKnowledge } from './load-knowledge.js';
import { loadMemories } from './load-memories.js';
import { generateResponse } from './generate-response.js';
import { translateOutbound } from './translate-outbound.js';
import { saveOutboundMessage } from './save-outbound-message.js';

export { resolveConversation } from './resolve-conversation.js';
export { detectLanguage } from './detect-language.js';
export { translateInbound } from './translate-inbound.js';
export { loadHistory } from './load-history.js';
export { saveInboundMessage } from './save-inbound-message.js';
export { classifyIntent } from './classify-intent.js';
export { computeEmbedding } from './compute-embedding.js';
export { loadKnowledge } from './load-knowledge.js';
export { loadMemories } from './load-memories.js';
export { generateResponse } from './generate-response.js';
export { translateOutbound } from './translate-outbound.js';
export { saveOutboundMessage } from './save-outbound-message.js';

/**
 * The default pipeline stages, in execution order.
 *
 * Used when `PipelineConfig.stages` is `undefined`. Stages that depend on
 * optional services or detection state (knowledge, memory, translation)
 * check before running and no-op when their inputs aren't present, so the
 * same defaults work for minimal and full deployments.
 *
 * Complete set of 12 stages.
 */
export const defaultStages: readonly Stage[] = [
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
];
