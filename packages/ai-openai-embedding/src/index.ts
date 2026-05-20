import type { AppManifest } from '@janetheoperator/shared';
import type {
  AppConfig,
  AppModule,
  EmbeddingContract,
  EmbeddingRequest,
  EmbeddingResult,
} from '@janetheoperator/shared/contracts';

/**
 * OpenAI Embeddings AI app. Capability: `embedding` — used by the AI
 * pipeline's `computeEmbedding` + `loadKnowledge` stages (Stage 7) to
 * find KB chunks relevant to the customer's question.
 *
 * `check()` does a real connectivity test (single-input `/v1/embeddings`
 * call). `embed()` batches every text into a single request — OpenAI
 * supports up to 2048 inputs per call.
 */

const OPENAI_URL = 'https://api.openai.com/v1/embeddings';
const MODELS = ['text-embedding-3-large', 'text-embedding-3-small'] as const;

interface OpenAiEmbeddingConfig extends AppConfig {
  apiKey: string;
  model: string;
}

const manifest: AppManifest = {
  id: 'ai-openai-embedding',
  name: 'OpenAI Embeddings',
  category: 'embedding',
  description: 'Embeds knowledge base content so the AI can search it for relevant answers.',
  configFields: [
    { key: 'apiKey', label: 'API key', type: 'password', required: true, secret: true },
    {
      key: 'model',
      label: 'Model',
      type: 'select',
      required: true,
      options: [
        // 3-large is stronger across the board (including non-English);
        // 3-small is cheaper, good enough for English-heavy deployments
        // but visibly weaker on Farsi / Arabic.
        { value: 'text-embedding-3-large', label: 'text-embedding-3-large (recommended)' },
        { value: 'text-embedding-3-small', label: 'text-embedding-3-small (cheaper)' },
      ],
    },
  ],
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const aiOpenAiEmbeddingModule: AppModule<OpenAiEmbeddingConfig> = {
  manifest,

  validate(config: AppConfig) {
    const errors: Record<string, string> = {};
    if (!str(config.apiKey)) errors.apiKey = 'API key is required';
    if (!(MODELS as readonly string[]).includes(str(config.model))) {
      errors.model = `Must be one of: ${MODELS.join(', ')}`;
    }
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
  },

  createInstance(config: OpenAiEmbeddingConfig): EmbeddingContract {
    return {
      async check() {
        return callOpenAi(config, { texts: ['ping'] })
          .then(() => ({ ok: true, detail: `Connected (${config.model})` }))
          .catch((e: Error) => ({ ok: false, detail: e.message }));
      },

      async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
        return callOpenAi(config, request);
      },
    };
  },
};

/**
 * Single fetch implementation shared by `check` and `embed`. Throws a
 * single-line error on non-2xx — callers (the AppContract.check wrapper
 * + the pipeline) map to their own result shapes.
 */
async function callOpenAi(
  config: OpenAiEmbeddingConfig,
  request: EmbeddingRequest,
): Promise<EmbeddingResult> {
  let res: Response;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        input: request.texts,
      }),
    });
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : 'connection failed');
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = body.error.message;
    } catch {
      /* keep status-line detail */
    }
    throw new Error(detail);
  }

  const body = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
    usage?: { prompt_tokens?: number; total_tokens?: number };
  };
  // OpenAI guarantees order matches input, but sort by `index` just in case
  // a future API version doesn't.
  const sorted = [...body.data].sort((a, b) => a.index - b.index);
  return {
    vectors: sorted.map((d) => d.embedding),
    usage: body.usage ? { inputTokens: body.usage.prompt_tokens ?? 0 } : undefined,
  };
}
