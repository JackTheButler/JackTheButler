import type { AppManifest } from '@janetheoperator/shared';
import type { AppConfig, AppModule } from '@janetheoperator/shared/contracts';

/**
 * Framework test app. Proves the package → manifest → registry → config →
 * instantiate loop end-to-end. Removed once real apps exist.
 */

interface StubConfig extends AppConfig {
  apiKey: string;
  label?: string;
}

const manifest: AppManifest = {
  id: 'stub',
  name: 'Stub (framework test)',
  category: 'channel',
  description: 'Proves the app-connection framework. Not a real integration.',
  configFields: [
    { key: 'apiKey', label: 'API key', type: 'password', required: true, secret: true },
    { key: 'label', label: 'Label', type: 'text', placeholder: 'optional' },
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
