import { IntentClassifier } from '@/core/ai/intent/index.js';
import { getAppRegistry } from '@/apps/index.js';
import { conversationService } from '@/services/conversation.js';
import { createLogger } from '@/utils/logger.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

let cachedClassifier: IntentClassifier | null = null;
let cachedProviderId: string | null = null;

function getClassifier(): IntentClassifier | null {
  const provider = getAppRegistry().getActiveAIProvider();
  if (!provider) return null;

  if (cachedProviderId !== provider.name) {
    cachedClassifier = new IntentClassifier(provider);
    cachedProviderId = provider.name;
  }

  return cachedClassifier;
}

export function resetClassifier(): void {
  cachedClassifier = null;
  cachedProviderId = null;
}

export async function classifyIntent(ctx: MessageContext): Promise<void> {
  const classifier = getClassifier();
  if (!classifier) return;

  const text = ctx.translatedContent ?? ctx.inbound.content;

  // Load recent conversation history excluding the current message (already saved by saveInboundMessage).
  // This allows the classifier to understand short replies like "yes please" or "cancel that"
  // in the context of the prior exchange.
  let history: Array<{ role: 'user' | 'assistant'; content: string }> | undefined;
  if (ctx.conversation && ctx.savedInboundId) {
    try {
      const messages = await conversationService.getMessages(ctx.conversation.id, { limit: 4 });
      const prior = messages.filter((m) => m.id !== ctx.savedInboundId);
      if (prior.length > 0) {
        history = prior.map((m) => ({
          role: m.direction === 'inbound' ? 'user' : 'assistant',
          content: (m.direction === 'inbound' && m.translatedContent) ? m.translatedContent : m.content,
        }));
      }
    } catch (err) {
      log.warn({ err }, 'Failed to load conversation history for classification');
    }
  }

  try {
    ctx.classification = await classifier.classify(text, history);
  } catch (err) {
    log.warn({ err }, 'Intent classification skipped');
  }
}
