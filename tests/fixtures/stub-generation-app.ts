import type { AppManifest } from '@janetheoperator/shared';
import type {
  AppConfig,
  AppModule,
  GenerationContract,
  GenerationRequest,
} from '@janetheoperator/shared/contracts';

/**
 * Test-only generation AI app. Records every `generate` call so the
 * pipeline test can assert the prompt + history shape, and returns a
 * scripted reply (default `'stub-reply'`) without any network IO.
 *
 * Captured calls are exposed via the exported `calls` array so each test
 * can `.length === 0` it between scenarios.
 */

interface StubAiConfig extends AppConfig {
  apiKey: string;
}

const manifest: AppManifest = {
  id: 'stub-ai',
  name: 'Stub AI (generation test)',
  category: 'ai',
  capability: 'generation',
  description: 'Test fixture for the generation pipeline.',
  configFields: [
    { key: 'apiKey', label: 'API key', type: 'password', required: true, secret: true },
  ],
};

export const stubAiCalls: GenerationRequest[] = [];
export let stubAiReply = 'stub-reply';

export function setStubAiReply(reply: string) {
  stubAiReply = reply;
}

export function resetStubAi() {
  stubAiCalls.length = 0;
  stubAiReply = 'stub-reply';
}

export const stubGenerationModule: AppModule<StubAiConfig> = {
  manifest,
  validate(config: AppConfig) {
    if (typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
      return { ok: false, errors: { apiKey: 'API key is required' } };
    }
    return { ok: true };
  },
  createInstance(): GenerationContract {
    return {
      async check() {
        return { ok: true, detail: 'stub-ai ready' };
      },
      async generate(request) {
        stubAiCalls.push(request);
        return { content: stubAiReply, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
  },
};
