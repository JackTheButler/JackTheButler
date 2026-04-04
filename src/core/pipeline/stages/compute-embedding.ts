import { getAppRegistry } from '@/apps/index.js';
import { createLogger } from '@/utils/logger.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

export async function computeEmbedding(ctx: MessageContext): Promise<void> {
  const provider = getAppRegistry().getEmbeddingProvider();
  if (!provider) return;

  const text = ctx.translatedContent ?? ctx.inbound.content;
  try {
    const result = await provider.embed({ text });
    ctx.queryEmbedding = result.embedding;
  } catch (err) {
    log.warn({ err }, 'Embedding skipped — provider unavailable');
  }
}
