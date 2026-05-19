import type { AppManifest } from '@janetheoperator/shared';
import type { AppConfig, AppModule } from '@janetheoperator/shared/contracts';

/**
 * Test-only stub app. Exercises the generic apps framework (encryption,
 * masking, status derivation, validation, instantiate) without depending on
 * a real integration's churn. Replaces the old `packages/app-stub` — never
 * shipped at runtime; injected via setAppModules() in tests.
 */

interface StubConfig extends AppConfig {
  apiKey: string;
  label?: string;
}

const manifest: AppManifest = {
  id: 'stub',
  name: 'Stub (framework test)',
  category: 'channel',
  description: 'Test fixture. Not a real integration.',
  configFields: [
    { key: 'apiKey', label: 'API key', type: 'password', required: true, secret: true },
    { key: 'label', label: 'Label', type: 'text' },
  ],
};

export const stubModule: AppModule<StubConfig> = {
  manifest,
  validate(config: AppConfig) {
    const apiKey = config.apiKey;
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      return { ok: false, errors: { apiKey: 'API key is required' } };
    }
    return { ok: true };
  },
  createInstance(config: StubConfig) {
    return {
      async check() {
        return { ok: true, detail: `stub ready${config.label ? `: ${config.label}` : ''}` };
      },
    };
  },
};
