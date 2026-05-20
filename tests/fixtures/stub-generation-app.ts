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
 * Branches on `request.purpose`:
 *   - `'language_detection'` → returns the configured detected language
 *     (default `'en'`, set via `setStubDetectedLanguage`).
 *   - `'translation'` → returns the configured translation output
 *     (default `'[translated]'`, set via `setStubTranslation`).
 *   - everything else (response generation) → returns the configured
 *     `stubAiReply`.
 *
 * `stubAiCalls` captures every call. Tests filter by `modelTier` or
 * `purpose` to find the call they care about.
 */

interface StubAiConfig extends AppConfig {
  apiKey: string;
}

const manifest: AppManifest = {
  id: 'stub-ai',
  name: 'Stub AI (generation test)',
  category: 'ai',
  description: 'Test fixture for the generation pipeline.',
  configFields: [
    { key: 'apiKey', label: 'API key', type: 'password', required: true, secret: true },
  ],
};

export const stubAiCalls: GenerationRequest[] = [];
export let stubAiReply = 'stub-reply';
let stubDetectedLanguage = 'en';
/** Translations keyed by `${from}->${to}`. Lookup falls back to a generic
 *  `'[translated]'` so tests that don't care about direction still work. */
const stubTranslations: Record<string, string> = {};

export function setStubAiReply(reply: string) {
  stubAiReply = reply;
}

export function setStubDetectedLanguage(lang: string) {
  stubDetectedLanguage = lang;
}

/** Configure the stub translator to return `text` for a specific direction.
 *  Pass `from` / `to` as BCP-47 codes matching what the package's translator
 *  prompt embeds ("Translate from X to Y …"). */
export function setStubTranslation(from: string, to: string, text: string) {
  stubTranslations[`${from}->${to}`] = text;
}

export function resetStubAi() {
  stubAiCalls.length = 0;
  stubAiReply = 'stub-reply';
  stubDetectedLanguage = 'en';
  for (const k of Object.keys(stubTranslations)) delete stubTranslations[k];
}

/** Helper for tests — the responder call (the one that actually generates
 *  the reply, not the detector or translator). */
export function lastResponderCall(): GenerationRequest | undefined {
  return stubAiCalls.filter((c) => c.purpose !== 'language_detection' && c.purpose !== 'translation').pop();
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
        if (request.purpose === 'language_detection') {
          return { content: stubDetectedLanguage, usage: { inputTokens: 1, outputTokens: 1 } };
        }
        if (request.purpose === 'translation') {
          // Parse direction out of the system prompt: "… from {from} to {to} …".
          // BCP-47 codes are letters + optional region (e.g. en, en-US, fa).
          const system = request.messages.find((m) => m.role === 'system')?.content ?? '';
          const m = /from\s+([a-zA-Z-]+)\s+to\s+([a-zA-Z-]+)/.exec(system);
          const key = m ? `${m[1]}->${m[2]}` : '';
          const content = stubTranslations[key] ?? '[translated]';
          return { content, usage: { inputTokens: 1, outputTokens: 1 } };
        }
        return { content: stubAiReply, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
  },
};
