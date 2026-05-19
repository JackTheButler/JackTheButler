import { z } from 'zod';

/** Request validation for the apps module. Per-app config shape is validated
 *  by the app's own manifest (service layer), not here. */

export const configBody = z.object({
  config: z.record(z.string(), z.unknown()),
});
