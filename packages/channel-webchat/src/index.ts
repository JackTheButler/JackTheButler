import type { AppManifest } from '@janetheoperator/shared';
import type {
  AppConfig,
  AppModule,
  ChannelContract,
} from '@janetheoperator/shared/contracts';

/**
 * WebChat channel app. Manifest config drives the embeddable widget's
 * appearance + the origin allowlist. Outbound `send` is a stub here —
 * real-time delivery is wired in slice 4 (WebSocket).
 */

export interface WebchatConfig extends AppConfig {
  title: string;
  welcomeMessage: string;
  accentColor: string;
  position: string;
  allowedDomains: string;
}

const POSITIONS = ['bottom-right', 'bottom-left'];

const manifest: AppManifest = {
  id: 'webchat',
  name: 'WebChat',
  category: 'channel',
  description: 'Embeddable chat widget for your website.',
  // No `themeDefault`: the loader resolves theme from the
  // `data-jane-theme` script attribute (default `'auto'` =>
  // `prefers-color-scheme`) and the `JaneWidget.setTheme()` JS API. The
  // server config doesn't enter that chain — the loader doesn't fetch
  // it — so storing a default here would be misleading.
  configFields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'welcomeMessage', label: 'Welcome message', type: 'text', required: true },
    { key: 'accentColor', label: 'Accent color', type: 'text', required: true },
    { key: 'position', label: 'Position', type: 'text', required: true },
    {
      key: 'allowedDomains',
      label: 'Allowed domains',
      type: 'text',
      required: true,
      placeholder: 'example.com, app.example.com',
    },
  ],
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const webchatModule: AppModule<WebchatConfig> = {
  manifest,

  validate(config: AppConfig) {
    const errors: Record<string, string> = {};
    if (!str(config.title)) errors.title = 'Title is required';
    if (!str(config.welcomeMessage)) errors.welcomeMessage = 'Welcome message is required';
    if (!str(config.accentColor)) errors.accentColor = 'Accent color is required';
    if (!POSITIONS.includes(str(config.position)))
      errors.position = `Position must be one of: ${POSITIONS.join(', ')}`;
    if (!str(config.allowedDomains))
      errors.allowedDomains = 'At least one allowed domain is required';
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
  },

  createInstance(config: WebchatConfig): ChannelContract {
    return {
      async check() {
        return { ok: true, detail: `webchat ready: ${config.title}` };
      },
      async send() {
        // Stub — outbound delivery (WebSocket push) is wired in slice 4.
      },
    };
  },
};
