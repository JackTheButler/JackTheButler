import type { AppManifest } from '@janetheoperator/shared';
import type {
  AppConfig,
  AppModule,
  GenerationContract,
  GenerationRequest,
  GenerationResult,
} from '@janetheoperator/shared/contracts';

/**
 * Anthropic (Claude) AI app. Capability: `generation` (covers both
 * answer-generation and utility calls like language/intent — the pipeline
 * picks the model per role via the two model fields below).
 *
 * `check()` is a minimal `/v1/messages` ping; `generate()` is the real
 * completion call the AI pipeline uses each turn.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 512;

const COMPLETION_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-6'] as const;
const UTILITY_MODELS = ['claude-haiku-4-5-20251001'] as const;

interface AnthropicConfig extends AppConfig {
  apiKey: string;
  completionModel: string;
  utilityModel: string;
}

const manifest: AppManifest = {
  id: 'ai-anthropic',
  name: 'Anthropic (Claude)',
  category: 'ai',
  capability: 'generation',
  description: 'Anthropic Claude — answer generation + utility tasks.',
  configFields: [
    { key: 'apiKey', label: 'API key', type: 'password', required: true, secret: true },
    {
      key: 'completionModel',
      label: 'Model for responses',
      type: 'select',
      required: true,
      options: [
        { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
        { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      ],
    },
    {
      key: 'utilityModel',
      label: 'Model for utility tasks',
      type: 'select',
      required: true,
      options: [{ value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }],
    },
  ],
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const aiAnthropicModule: AppModule<AnthropicConfig> = {
  manifest,

  validate(config: AppConfig) {
    const errors: Record<string, string> = {};
    if (!str(config.apiKey)) errors.apiKey = 'API key is required';
    if (!(COMPLETION_MODELS as readonly string[]).includes(str(config.completionModel))) {
      errors.completionModel = `Must be one of: ${COMPLETION_MODELS.join(', ')}`;
    }
    if (!(UTILITY_MODELS as readonly string[]).includes(str(config.utilityModel))) {
      errors.utilityModel = `Must be one of: ${UTILITY_MODELS.join(', ')}`;
    }
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
  },

  createInstance(config: AnthropicConfig): GenerationContract {
    return {
      async check() {
        return await callAnthropic(config, {
          messages: [{ role: 'user', content: 'ping' }],
          maxTokens: 1,
        })
          .then(() => ({ ok: true, detail: `Connected (${config.completionModel})` }))
          .catch((e: Error) => ({ ok: false, detail: e.message }));
      },

      async generate(request: GenerationRequest): Promise<GenerationResult> {
        return callAnthropic(config, request);
      },
    };
  },
};

/**
 * Single fetch implementation shared by `check` and `generate`. Anthropic
 * wants the system prompt as a top-level `system` string, separate from
 * `messages` (which are user / assistant turns), so we split here.
 * Throws a single-line error on non-2xx — callers map to their own result
 * shapes.
 */
async function callAnthropic(
  config: AnthropicConfig,
  request: GenerationRequest,
): Promise<GenerationResult> {
  const systemParts: string[] = [];
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of request.messages) {
    if (m.role === 'system') systemParts.push(m.content);
    else turns.push({ role: m.role, content: m.content });
  }

  // Route utility tier (detect / translate) to the cheaper Haiku-class
  // model the operator picked; everything else (response generation) goes
  // to the main completion model.
  const model =
    request.modelTier === 'utility' ? config.utilityModel : config.completionModel;

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(request.temperature !== undefined && { temperature: request.temperature }),
        ...(systemParts.length > 0 && { system: systemParts.join('\n\n') }),
        messages: turns,
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
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = body.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!)
    .join('');
  return {
    content: text,
    usage: body.usage
      ? {
          inputTokens: body.usage.input_tokens ?? 0,
          outputTokens: body.usage.output_tokens ?? 0,
        }
      : undefined,
  };
}
