/**
 * Setup Page
 *
 * Entry point for the setup wizard using the shared assistant system.
 *
 * @module pages/Setup
 */

import { AssistantProvider } from '@/shared/assistant';
import { SetupAssistant } from '@/features/setup';

/**
 * Setup page component - wraps SetupAssistant with AssistantProvider
 */
export function SetupPage() {
  return (
    <AssistantProvider>
      <SetupAssistant />
    </AssistantProvider>
  );
}
