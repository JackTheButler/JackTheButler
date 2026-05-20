import type { AppManifest } from '@janetheoperator/shared';
import type {
  AppConfig,
  AppModule,
  EmbeddingContract,
  EmbeddingRequest,
} from '@janetheoperator/shared/contracts';

/**
 * Test-only embedding AI app. Returns deterministic vectors so KB
 * retrieval tests can assert on cosine ordering without a real embedding
 * provider. Each input text gets the same fixed vector by default; tests
 * can override via `setStubVectors` to script specific scenarios.
 */

interface StubEmbedConfig extends AppConfig {
  apiKey: string;
}

const manifest: AppManifest = {
  id: 'stub-embed',
  name: 'Stub Embedding (test)',
  category: 'embedding',
  description: 'Test fixture for the embedding contract + KB pipeline.',
  configFields: [
    { key: 'apiKey', label: 'API key', type: 'password', required: true, secret: true },
  ],
};

export const stubEmbedCalls: EmbeddingRequest[] = [];
let stubVectorByText: Record<string, readonly number[]> = {};
let stubDefaultVector: readonly number[] = [1, 0, 0];

export function setStubVector(text: string, vector: readonly number[]) {
  stubVectorByText[text] = vector;
}

export function setStubDefaultVector(vector: readonly number[]) {
  stubDefaultVector = vector;
}

export function resetStubEmbed() {
  stubEmbedCalls.length = 0;
  stubVectorByText = {};
  stubDefaultVector = [1, 0, 0];
}

export const stubEmbeddingModule: AppModule<StubEmbedConfig> = {
  manifest,
  validate(config: AppConfig) {
    if (typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
      return { ok: false, errors: { apiKey: 'API key is required' } };
    }
    return { ok: true };
  },
  createInstance(): EmbeddingContract {
    return {
      async check() {
        return { ok: true, detail: 'stub-embed ready' };
      },
      async embed(request) {
        stubEmbedCalls.push(request);
        return {
          vectors: request.texts.map((t) => stubVectorByText[t] ?? stubDefaultVector),
          usage: { inputTokens: request.texts.length },
        };
      },
    };
  },
};
