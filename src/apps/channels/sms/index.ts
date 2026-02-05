/**
 * SMS Channel Extension
 *
 * Exports for SMS channel integrations.
 *
 * @module extensions/channels/sms
 */

export {
  TwilioProvider,
  createTwilioProvider,
  manifest as twilioManifest,
  type TwilioConfig,
} from './twilio.js';
