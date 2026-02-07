/**
 * Assistant Components
 *
 * UI components for the assistant system.
 *
 * @module shared/assistant/components
 */

// Core container
export { AssistantContainer, AssistantStep } from './AssistantContainer';
export type { AssistantContainerProps, AssistantStepProps } from './AssistantContainer';

// Render mode components
export { AssistantFullscreen } from './AssistantFullscreen';
export type { AssistantFullscreenProps } from './AssistantFullscreen';

export { AssistantPopup } from './AssistantPopup';
export type { AssistantPopupProps } from './AssistantPopup';

export { AssistantEmbedded } from './AssistantEmbedded';
export type { AssistantEmbeddedProps } from './AssistantEmbedded';

export { AssistantFloating } from './AssistantFloating';
export type { AssistantFloatingProps, FloatingPosition } from './AssistantFloating';

// Trigger components
export { AssistantTrigger, AssistantSuggestion } from './AssistantTrigger';
export type { AssistantTriggerProps, AssistantSuggestionProps } from './AssistantTrigger';
