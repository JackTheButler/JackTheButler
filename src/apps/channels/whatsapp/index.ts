/**
 * WhatsApp Channel Extension
 *
 * Exports for WhatsApp channel integrations.
 *
 * @module extensions/channels/whatsapp
 */

export {
  MetaWhatsAppProvider,
  createMetaWhatsAppProvider,
  manifest as metaWhatsAppManifest,
  type MetaWhatsAppConfig,
  type SendMessageRequest,
  type SendMessageResponse,
} from './meta.js';
