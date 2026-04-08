import { IntentClassifier } from '@/core/ai/intent/index.js';
import { getAppRegistry } from '@/apps/index.js';
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

  try {
    ctx.classification = await classifier.classify(text, ctx.conversationHistory);
  } catch (err) {
    log.warn({ err }, 'Intent classification skipped');
  }
}
